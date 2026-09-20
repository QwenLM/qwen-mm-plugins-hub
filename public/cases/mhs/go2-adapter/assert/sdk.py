"""Unitree SDK and DDS access, isolated from the MHS device/HTTP interface."""

import threading
import time
from datetime import datetime, timezone

from adapter_server import MhsError
from camera import camera_result


class SDK:
    def __init__(self, interface):
        from unitree_sdk2py.comm.motion_switcher.motion_switcher_client import MotionSwitcherClient
        from unitree_sdk2py.core.channel import ChannelFactoryInitialize, ChannelSubscriber
        from unitree_sdk2py.go2.obstacles_avoid.obstacles_avoid_client import ObstaclesAvoidClient
        from unitree_sdk2py.go2.sport.sport_client import SportClient
        from unitree_sdk2py.idl.unitree_go.msg.dds_ import LowState_, SportModeState_

        self.lock = threading.RLock()
        self.low = self.high = None
        self.low_at = self.high_at = 0.0
        self.count_low = self.count_high = 0
        self.interface = interface
        self.camera_lock = threading.Lock()
        self.camera = None
        self.controller_lock = threading.Lock()
        self.controller_name = None
        self.controller_at = 0.0
        self.controller_code = None
        ChannelFactoryInitialize(0, interface)
        self.low_sub = ChannelSubscriber("rt/lowstate", LowState_)
        self.high_sub = ChannelSubscriber("rt/sportmodestate", SportModeState_)
        self.low_sub.Init(self.on_low)
        self.high_sub.Init(self.on_high)
        self.low_lf_sub = ChannelSubscriber("rt/lf/lowstate", LowState_)
        self.high_lf_sub = ChannelSubscriber("rt/lf/sportmodestate", SportModeState_)
        self.low_lf_sub.Init(self.on_low)
        self.high_lf_sub.Init(self.on_high)
        self.client, self.stopper = SportClient(), SportClient()
        self.client.SetTimeout(3.0)
        self.stopper.SetTimeout(1.0)
        self.client.Init()
        self.stopper.Init()
        self.avoid = ObstaclesAvoidClient()
        self.avoid.SetTimeout(1.0)
        self.avoid.Init()
        self.controller = MotionSwitcherClient()
        self.controller.SetTimeout(1.0)
        self.controller.Init()
        self.refresh_controller()

    def refresh_controller(self):
        if time.monotonic() - self.controller_at < 2 or not self.controller_lock.acquire(blocking=False):
            return
        try:
            try:
                code, mode = self.controller.CheckMode()
            except Exception:
                code, mode = "query_failed", None
            with self.lock:
                self.controller_code = code
                self.controller_name = mode.get("name") if code == 0 and isinstance(mode, dict) else None
                self.controller_at = time.monotonic()
        finally:
            self.controller_lock.release()

    def avoidance_state(self):
        try:
            code, enabled = self.avoid.SwitchGet()
            return {"available": code == 0, "enabled": enabled if code == 0 else None, "sdk_code": code}
        except Exception as exc:
            return {"available": False, "enabled": None, "sdk_code": None, "error": str(exc)}

    def on_low(self, msg):
        with self.lock:
            self.low, self.low_at = msg, time.monotonic()
            self.count_low += 1

    def on_high(self, msg):
        with self.lock:
            self.high, self.high_at = msg, time.monotonic()
            self.count_high += 1

    def state(self):
        with self.lock:
            if self.low is None or self.high is None:
                raise MhsError(
                    503,
                    "no_dds_state",
                    f"Waiting for physical Go2 state: low={self.count_low}, sport={self.count_high}",
                )
            age = max(time.monotonic() - self.low_at, time.monotonic() - self.high_at)
            if age > 0.5:
                raise MhsError(503, "stale_dds_state", f"Physical Go2 state is stale: {age:.2f} seconds")
            low, high = self.low, self.high
            return {
                "simulation": False,
                "interface": self.interface,
                "dds_domain": 0,
                "state_age_s": age,
                "received_lowstate": self.count_low,
                "received_sportmodestate": self.count_high,
                "robot_serial_words": list(low.sn),
                "sport_mode": high.mode,
                "sport_error_code": high.error_code,
                "motion_controller": self.controller_name,
                "controller_query_code": self.controller_code,
                "controller_age_s": time.monotonic() - self.controller_at,
                "action_progress": high.progress,
                "body_height_m": high.body_height,
                "position_m": list(high.position),
                "velocity_m_s": list(high.velocity),
                "yaw_speed_rad_s": high.yaw_speed,
                "imu_rpy_rad": list(low.imu_state.rpy),
                "imu_angular_velocity_rad_s": list(low.imu_state.gyroscope),
                "joint_position_rad": [m.q for m in low.motor_state[:12]],
                "joint_velocity_rad_s": [m.dq for m in low.motor_state[:12]],
                "motor_temperature_c": [m.temperature for m in low.motor_state[:12]],
                "motor_fault_flags": [m.reserve[0] for m in low.motor_state[:12]],
                "battery_percent": low.bms_state.soc,
                "battery_voltage_v": low.power_v,
                "foot_force": list(low.foot_force),
            }

    def command(self, method):
        return getattr(self.client, method)()

    def frame(self):
        if not self.camera_lock.acquire(blocking=False):
            raise MhsError(409, "camera_busy", "Another camera capture is in progress")
        try:
            if self.camera is None:
                from unitree_sdk2py.go2.video.video_client import VideoClient

                camera = VideoClient()
                camera.SetTimeout(3.0)
                camera.Init()
                self.camera = camera
            started = time.monotonic()
            code, data = self.camera.GetImageSample()
            received_at = datetime.now(timezone.utc).isoformat()
            elapsed_s = time.monotonic() - started
            if code != 0:
                raise MhsError(
                    503, "camera_rpc_failed", f"VideoClient.GetImageSample returned SDK code {code}"
                )
            return camera_result(data, received_at, elapsed_s)
        except MhsError:
            raise
        except Exception as exc:
            raise MhsError(503, "camera_unavailable", f"Camera capture failed: {exc}") from exc
        finally:
            self.camera_lock.release()

    def stop(self):
        return self.stopper.Damp()

    def soft(self):
        return self.stopper.StopMove()
