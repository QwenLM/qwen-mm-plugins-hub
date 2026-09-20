import json
import threading

import cv2
import numpy as np
import pytest

from adapter_server import MhsError
from camera import camera_result
from device import Go2
from sdk import SDK
from state import measured_completion, validate_pose


def sample(**updates):
    state = {
        "simulation": False,
        "sport_error_code": 0,
        "sport_mode": 0,
        "motion_controller": "normal",
        "controller_age_s": 0.0,
        "imu_rpy_rad": [0.0, 0.0, 0.0],
        "velocity_m_s": [0.0, 0.0, 0.0],
        "yaw_speed_rad_s": 0.0,
        "joint_position_rad": [0.0] * 12,
        "joint_velocity_rad_s": [0.0] * 12,
        "imu_angular_velocity_rad_s": [0.0, 0.0, 0.0],
        "body_height_m": 0.32,
        "position_m": [0.0, 0.0, 0.0],
        "motor_fault_flags": [0] * 12,
        "motor_temperature_c": [40] * 12,
        "battery_percent": 70,
    }
    state.update(updates)
    return state


class FakeSDK:
    def __init__(self, state=None, code=0):
        self.snapshot = sample() if state is None else state
        self.code = code
        self.calls = []

    def state(self):
        return dict(self.snapshot)

    def refresh_controller(self):
        pass

    def command(self, method):
        self.calls.append(method)
        return self.code

    def stop(self):
        self.calls.append("Damp")
        return self.code

    def soft(self):
        self.calls.append("StopMove")
        return self.code


@pytest.mark.parametrize("params", [{}, {"pose": "walk"}, {"pose": "stand", "kp": 1000}])
def test_no_unadvertised_motion_or_raw_parameters(params):
    with pytest.raises(MhsError):
        validate_pose(params)


def test_read_only_cannot_send_any_motion_or_reset_rpc():
    sdk = FakeSDK()
    go2 = Go2(sdk)
    with pytest.raises(MhsError, match="disabled"):
        go2.write("posture", {"pose": "stand"})
    with pytest.raises(MhsError, match="read-only"):
        go2.reset({"mode": "estop"})
    assert sdk.calls == []


@pytest.mark.parametrize(
    "state",
    [
        sample(sport_error_code=7),
        sample(sport_mode=11),
        sample(imu_rpy_rad=[3.14, 0, 0]),
        sample(velocity_m_s=[1, 0, 0]),
    ],
)
def test_invalid_physical_state_blocks_before_rpc(state):
    sdk = FakeSDK(state)
    go2 = Go2(sdk, allow_motion=True)
    with pytest.raises(MhsError):
        go2.write("posture", {"pose": "stand"})
    assert sdk.calls == []


def test_sdk_refusal_is_not_retried_or_reported_as_completed():
    sdk = FakeSDK(code=3103)
    result = Go2(sdk, allow_motion=True).write("posture", {"pose": "stand"})
    assert result["ok"] is False
    assert sdk.calls == ["StandUp"]
    assert "sdk_refused" in result["blocks"][0]["text"]


def test_seated_to_standing_uses_vendor_rise_sit():
    sdk = FakeSDK(sample(sport_mode=10), code=3103)
    Go2(sdk, allow_motion=True).write("posture", {"pose": "stand"})
    assert sdk.calls == ["RiseSit"]


def test_stop_latch_blocks_followup_motion_even_if_damp_rpc_fails():
    sdk = FakeSDK(code=3103)
    go2 = Go2(sdk, allow_motion=True)
    assert go2.reset({"mode": "estop"})["ok"] is False
    with pytest.raises(MhsError, match="latched"):
        go2.write("posture", {"pose": "stand"})
    assert sdk.calls == ["Damp"]


def test_mode_alone_is_not_evidence_of_completed_posture():
    assert not measured_completion("stand", sample(body_height_m=0.05))
    assert not measured_completion("sit", sample(sport_mode=10, joint_velocity_rad_s=[1.0] * 12))


def test_mcf_decodes_known_states_without_treating_them_as_faults():
    sdk = FakeSDK(sample(motion_controller="mcf", sport_error_code=2009))
    go2 = Go2(sdk)
    assert go2.state()["motion_state"] == "free_jump"
    assert go2.health()["healthy"] is True
    assert sdk.calls == []


def test_mcf_unknown_state_and_real_motor_flags_still_block():
    for state in [
        sample(motion_controller="mcf", sport_error_code=9999),
        sample(motion_controller="mcf", sport_error_code=100, motor_fault_flags=[2] + [0] * 11),
    ]:
        sdk = FakeSDK(state)
        with pytest.raises(MhsError):
            Go2(sdk, allow_motion=True).write("posture", {"pose": "stand"})
        assert sdk.calls == []


def test_mcf_posture_completion_uses_firmware_state_and_measured_quietness():
    assert measured_completion("sit", sample(motion_controller="mcf", sport_error_code=1007))
    assert measured_completion(
        "stand", sample(motion_controller="mcf", sport_error_code=1002, body_height_m=0.22)
    )
    assert not measured_completion("stand", sample(motion_controller="mcf", sport_error_code=1007))
    assert not measured_completion(
        "sit", sample(motion_controller="mcf", sport_error_code=1007, joint_velocity_rad_s=[1] * 12)
    )


def test_unexpected_sdk_exception_stops_and_latches():
    class FailedSDK(FakeSDK):
        def command(self, method):
            self.calls.append(method)
            raise RuntimeError("connection failed after request transmission")

    sdk = FailedSDK()
    go2 = Go2(sdk, allow_motion=True)
    result = go2.write("posture", {"pose": "stand"})
    assert result["ok"] is False
    assert sdk.calls == ["StandUp", "Damp"]
    assert go2.estopped


def test_frame_returns_decodable_bounded_jpeg_and_metadata():
    original = np.zeros((1200, 2400, 3), dtype=np.uint8)
    original[:, :, 1] = 180
    _, png = cv2.imencode(".png", original)
    result = camera_result(png.tobytes(), "2026-09-08T10:00:00+00:00", 0.1)
    block, info_block = result["blocks"]
    assert block["type"] == "image" and block["mimeType"] == "image/jpeg"
    image = cv2.imdecode(np.frombuffer(block["data"], dtype=np.uint8), cv2.IMREAD_COLOR)
    assert image.shape == (320, 640, 3)
    info = json.loads(info_block["text"])
    assert (info["source_width"], info["source_height"]) == (2400, 1200)
    assert (info["width"], info["height"]) == (640, 320)


@pytest.mark.parametrize("data", [b"", b"not an image"])
def test_bad_camera_samples_are_errors(data):
    with pytest.raises(MhsError, match="Camera sample"):
        camera_result(data, "now", 0.1)


def test_frame_does_not_depend_on_motion_health_or_call_actuators():
    class CameraSDK(FakeSDK):
        def state(self):
            raise MhsError(503, "no_dds_state", "No motion state")

        def frame(self):
            return {"blocks": [{"type": "text", "text": "camera sample"}]}

    sdk = CameraSDK()
    go2 = Go2(sdk)
    assert go2.health()["healthy"] is False
    assert go2.read("frame", {})["blocks"][0]["text"] == "camera sample"
    frame = next(c for c in go2.meta()["capabilities"] if c["name"] == "frame")
    assert frame["direction"] == "read"
    with pytest.raises(MhsError):
        go2.read("frame", {"pose": "sit"})
    with pytest.raises(MhsError):
        go2.write("frame", {})
    assert sdk.calls == []


def test_camera_rpc_failure_is_reported_once_and_releases_lock():
    class Camera:
        calls = 0

        def GetImageSample(self):
            self.calls += 1
            return 3104, []

    sdk = SDK.__new__(SDK)
    sdk.camera = Camera()
    sdk.camera_lock = threading.Lock()
    with pytest.raises(MhsError, match="3104") as exc:
        sdk.frame()
    assert exc.value.code == "camera_rpc_failed"
    assert sdk.camera.calls == 1
    assert not sdk.camera_lock.locked()
