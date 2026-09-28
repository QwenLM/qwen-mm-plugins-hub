"""Go2 MHS capabilities and operation lifecycle."""

import json
import math
import threading
import time

from adapter_server import MhsError, text_result
from motion import MOVE_LIMITS, MotionMixin
from state import measured_completion, motion_state, state_problem, validate_pose


class Go2(MotionMixin):
    device_id = "go2"
    error = MhsError
    result = staticmethod(text_result)

    def __init__(self, sdk, allow_motion=False, use_avoidance=True):
        self.sdk = sdk
        self.allow_motion = allow_motion
        self.use_avoidance = use_avoidance
        self.lock = threading.RLock()
        self.operation = threading.Lock()
        self.motion_io = threading.Lock()
        self.generation = 0
        self.estopped = False
        self.busy = False
        self.last_command = None
        self.rpc_count = 0
        self.motion_active = False
        self.stop_in_progress = False
        self.avoid_control_attempted = False
        self.direct_control_attempted = False
        self.move_command_count = 0

    def state(self, refresh_controller=False):
        if refresh_controller:
            self.sdk.refresh_controller()
        value = self.sdk.state()
        value["motion_state"] = motion_state(value)
        with self.lock:
            value.update(
                {
                    "motion_enabled": self.allow_motion,
                    "move_avoidance_enabled": self.use_avoidance,
                    "estop_latched": self.estopped,
                    "adapter_busy": self.busy,
                    "last_command": self.last_command,
                    "posture_rpc_count": self.rpc_count,
                    "move_command_count": self.move_command_count,
                    "motion_active": self.motion_active,
                }
            )
        return value

    def health(self):
        try:
            state = self.state(refresh_controller=True)
            problem = state_problem(state)
            healthy = problem is None and not self.estopped
            status = (
                "maintenance"
                if self.estopped
                else "error"
                if not healthy
                else "busy"
                if self.busy
                else "online"
            )
            return {
                "state": status,
                "healthy": healthy,
                "detail": problem
                or "Live Go2 DDS state; controller=%s; motion=%s"
                % (state["motion_controller"], "enabled" if self.allow_motion else "disabled"),
                "checks": [
                    {"name": "dds_fresh", "ok": True},
                    {"name": "motion_state_recognised", "ok": state["motion_state"] != "unknown"},
                    {"name": "motor_fault_flags_clear", "ok": not any(state["motor_fault_flags"])},
                ],
            }
        except MhsError as exc:
            return {"state": "offline", "healthy": False, "detail": str(exc)}

    def summary(self):
        return {
            "device_id": self.device_id,
            "device_type": "quadruped",
            "state": self.health()["state"],
            "summary": "Physical Unitree Go2 through the existing Unitree camera, posture and avoidance SDKs",
            "tags": ["go2", "real-hardware"],
            "capabilities": ["state", "posture", "frame", "move", "stop", "avoidance"],
        }

    def meta(self):
        route = (
            "Native avoidance enabled; uses ObstaclesAvoidClient.Move."
            if self.use_avoidance
            else "Native avoidance DISABLED; uses SportClient.Move for controlled diagnostics."
        )
        return {
            "device_type": "quadruped",
            "manufacturer": "Unitree",
            "model": "Go2",
            "location": "Go2 onboard computer; DDS interface selected at startup, domain 0",
            "state": self.health()["state"],
            "tags": ["go2", "real-hardware"],
            "description": f"Physical Go2. {route} Timed movement uses body-frame velocity, then zero velocity and StopMove with measured settling. No low-level joint publisher, automatic fallback or gait switching. State is measured from DDS; MCF's raw error_code is decoded as motion state, not a fault bitmask. Keep the operating area clear and retain the remote emergency stop. Estop uses Damp, which can lower the body under gravity.",
            "documentation_url": "https://github.com/unitreerobotics/unitree_sdk2_python",
            "capabilities": [
                {
                    "name": "frame",
                    "direction": "read",
                    "description": "Capture one current front-camera image using official VideoClient.GetImageSample. Returns JPEG, at most 640 pixels on the long edge (640x360 for a 1920x1080 source), preserving aspect ratio, plus dimensions and receipt time. Takes no parameters; does not depend on the sport error field or issue motion commands.",
                },
                {
                    "name": "state",
                    "direction": "read",
                    "description": "Fresh controller, decoded and raw motion state, IMU, 12 joints, motor fault flags and battery.",
                },
                {
                    "name": "avoidance",
                    "direction": "read",
                    "description": "Read the native avoidance switch with ObstaclesAvoidClient.SwitchGet. A timeout returns available=false and the SDK code; it never enables avoidance or changes gait.",
                },
                {
                    "name": "move",
                    "direction": "both" if self.allow_motion else "read",
                    "requires_confirm": True,
                    "description": f"Read activity/state; write timed velocity. {route} Same arguments as simulation: vx forward, vy left (m/s), vyaw counterclockwise (rad/s), duration_s. Defaults: velocities 0, duration 2s. Requires stable ordinary standing/walking mode. Sets and verifies the configured avoidance switch before movement; direct mode releases avoidance API control. Automatically zeros velocity and stops. Reports measured displacement; movement direction and requested distance are not guaranteed by a completed response. No target-position navigation or automatic gait/service switching.",
                    "params": {
                        name: {"type": "number", "description": f"Hard range [{bounds[0]}, {bounds[1]}]"}
                        for name, bounds in MOVE_LIMITS.items()
                    },
                },
                {
                    "name": "stop",
                    "direction": "both" if self.allow_motion else "read",
                    "requires_confirm": False,
                    "description": "Read activity/state; write with no parameters to cancel adapter movement, zero the active velocity client, request StopMove and wait for measured settling. Use estop to cancel posture transitions or request damping.",
                },
                {
                    "name": "posture",
                    "direction": "both" if self.allow_motion else "read",
                    "requires_confirm": True,
                    "description": "stand or sit using vendor high-level control. No speed, gain, torque or joint parameters. Waits up to 15 seconds for measured completion; does not retry failed RPCs.",
                    "params": {
                        "pose": {
                            "type": "string",
                            "enum": ["stand", "sit"],
                            "description": "Required: stand or sit. Both change physical posture.",
                        }
                    },
                },
            ],
            "safety_limits": [
                {
                    "parameter": name,
                    "min": bounds[0],
                    "max": bounds[1],
                    "hard": True,
                    "unit": "s" if name == "duration_s" else "rad/s" if name == "vyaw" else "m/s",
                    "description": "Conservative limit for this physical adapter",
                }
                for name, bounds in MOVE_LIMITS.items()
            ],
        }

    def read(self, capability, params):
        if capability not in ("state", "posture", "frame", "move", "stop", "avoidance"):
            raise MhsError(404, "unknown_capability", "Unknown readable capability")
        if params:
            raise MhsError(400, "bad_parameter", "Reads take no parameters")
        if capability == "frame":
            return self.sdk.frame()
        if capability == "avoidance":
            with self.motion_io:
                with self.lock:
                    if self.busy or self.stop_in_progress:
                        raise MhsError(409, "busy", "Avoidance queries are paused while motion is active")
                return {"blocks": [{"type": "text", "text": json.dumps(self.sdk.avoidance_state())}]}
        return {"blocks": [{"type": "text", "text": json.dumps(self.state(refresh_controller=True))}]}

    def preflight(self, state, stationary=True):
        problem = state_problem(state)
        if problem:
            raise MhsError(409, "robot_not_ready", problem)
        if stationary and state["motion_state"] not in {
            "idle",
            "balance_stand",
            "pose",
            "lie_down",
            "joint_lock",
            "damping",
            "sit",
            "free_walk",
            "free_avoid",
            "free_bound",
            "free_jump",
        }:
            raise MhsError(409, "robot_busy", "Robot is not in a supported stationary posture mode")
        if stationary and (
            max(abs(v) for v in state["velocity_m_s"]) > 0.10 or abs(state["yaw_speed_rad_s"]) > 0.20
        ):
            raise MhsError(409, "robot_moving", "Robot is moving; posture command refused")
        roll, pitch = state["imu_rpy_rad"][:2]
        if math.cos(roll) * math.cos(pitch) < 0.5:
            raise MhsError(
                409, "robot_tilted", "Torso is tilted over 60 degrees; no self-righting is exposed"
            )

    def write(self, capability, params):
        if capability == "move":
            return self.move(params)
        if capability == "stop":
            return self.stop_motion(params)
        if capability != "posture":
            raise MhsError(404, "unknown_capability", "Only posture, move and stop can be written")
        pose = validate_pose(params)
        if not self.allow_motion:
            raise MhsError(403, "read_only", "Motion is disabled in this adapter process")
        if not self.operation.acquire(blocking=False):
            raise MhsError(409, "busy", "Another posture operation is active")
        try:
            before = self.state(refresh_controller=True)
            self.preflight(before)
            with self.lock:
                if self.stop_in_progress:
                    raise MhsError(409, "stopping", "Wait for the current stop to finish")
                if self.estopped:
                    raise MhsError(
                        409, "estop_latched", "Stop is latched; inspect and soft reset before another action"
                    )
                self.generation += 1
                generation = self.generation
                self.busy = True
                self.last_command = pose
                method = (
                    "Sit" if pose == "sit" else "RiseSit" if before["motion_state"] == "sit" else "StandUp"
                )
                self.rpc_count += 1
            started = time.monotonic()
            code = self.sdk.command(method)
            with self.lock:
                cancelled = generation != self.generation
            if cancelled:
                stop_code = self.sdk.stop()
                return text_result(False, "maintenance", result="interrupted", stop_sdk_code=stop_code)
            if code != 0:
                return text_result(False, "error", result="sdk_refused", api=method, sdk_code=code)
            stable_since = None
            while time.monotonic() - started < 15:
                with self.lock:
                    if generation != self.generation:
                        return text_result(False, "maintenance", result="interrupted")
                actual = self.state()
                if state_problem(actual):
                    raise MhsError(409, "robot_not_ready", state_problem(actual))
                quiet = measured_completion(pose, actual)
                changed = (
                    max(
                        abs(a - b) for a, b in zip(before["joint_position_rad"], actual["joint_position_rad"])
                    )
                    > 0.20
                )
                evidence = changed or measured_completion(pose, before)
                now = time.monotonic()
                if quiet and evidence and now - started >= 3:
                    stable_since = stable_since or now
                    if now - stable_since >= 0.75:
                        return text_result(
                            True,
                            "online",
                            result="measured_completed",
                            pose=pose,
                            api=method,
                            sdk_code=code,
                            elapsed_s=now - started,
                            before=before,
                            after=actual,
                        )
                else:
                    stable_since = None
                time.sleep(0.05)
            stop = self.reset({"mode": "estop"})
            return text_result(
                False,
                "maintenance",
                result="completion_unverified",
                api=method,
                sdk_code=code,
                measured_state=self.state(),
                emergency_stop=stop,
            )
        except MhsError:
            if self.busy:
                self.reset({"mode": "estop"})
            raise
        except Exception as exc:  # noqa: BLE001 - stop/report unexpected SDK or HTTP failures
            # A failed SDK call may already have reached hardware. Latch and stop.
            try:
                stop = self.reset({"mode": "estop"})
            except Exception as stop_exc:  # noqa: BLE001 - preserve the original failure and failed stop result
                stop = {"ok": False, "error": str(stop_exc)}
            return text_result(
                False, "error", result="unexpected_sdk_error", error=str(exc), emergency_stop=stop
            )
        finally:
            with self.lock:
                self.busy = False
            self.operation.release()

    def reset(self, params):
        mode = params.get("mode", "soft")
        if set(params) - {"mode"} or mode not in ("soft", "estop"):
            raise MhsError(400, "bad_parameter", "reset mode must be soft or estop")
        if not self.allow_motion:
            raise MhsError(405, "read_only", "This read-only observer does not issue stop or reset commands")
        with self.lock:
            if mode == "soft" and self.busy:
                raise MhsError(409, "busy", "Use estop to cancel an active command before a soft reset")
            self.generation += 1
            if mode == "estop":
                self.estopped = True
        if mode == "estop":
            # Wait for any in-flight Move, then stop and release avoidance
            # ownership. Generation was invalidated before waiting.
            with self.motion_io:
                controlled = self.avoid_control_attempted or self.direct_control_attempted
                if not controlled:
                    code = self.sdk.stop()
            if controlled:
                self._finish_move_sdk(force_stop=True)
                code = 0
        else:
            with self.motion_io:
                code = self.sdk.soft()
        if mode == "soft" and code == 0:
            with self.lock:
                self.estopped = False
        return text_result(
            code == 0,
            "maintenance" if self.estopped else "online",
            mode=mode,
            sdk_code=code,
            api="Damp" if mode == "estop" else "StopMove",
        )
