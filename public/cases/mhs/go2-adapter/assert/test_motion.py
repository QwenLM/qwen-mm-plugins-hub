import json
from types import SimpleNamespace

import pytest

import motion
from adapter_server import MhsError
from device import Go2
from test_adapter import FakeSDK, sample


class Avoid:
    def __init__(self, sdk):
        self.sdk = sdk
        self.enabled = True
        self.codes = {}

    def SwitchGet(self):
        self.sdk.calls.append("SwitchGet")
        return self.codes.get("SwitchGet", 0), self.enabled

    def SwitchSet(self, enabled):
        self.sdk.calls.append(("SwitchSet", enabled))
        self.enabled = enabled
        return self.codes.get("SwitchSet", 0)

    def UseRemoteCommandFromApi(self, enabled):
        self.sdk.calls.append(("UseRemoteCommandFromApi", enabled))
        return self.codes.get(("UseRemoteCommandFromApi", enabled), 0)

    def Move(self, vx, vy, vyaw):
        self.sdk.calls.append(("Move", vx, vy, vyaw))
        self.sdk.velocity = [vx, vy, vyaw]
        self.sdk.snapshot["velocity_m_s"] = [vx, vy, 0]
        self.sdk.snapshot["imu_angular_velocity_rad_s"] = [0, 0, vyaw]
        return self.codes.get("Move" if any((vx, vy, vyaw)) else "Zero", 0)


class MovingSDK(FakeSDK):
    def __init__(self):
        super().__init__(sample(motion_controller="mcf", sport_error_code=100, body_height_m=0.23))
        self.avoid = Avoid(self)
        self.velocity = [0, 0, 0]
        self.observed_motion = True

    def soft(self):
        self.calls.append("StopMove")
        self.velocity = [0, 0, 0]
        self.snapshot["velocity_m_s"] = [0, 0, 0]
        self.snapshot["imu_angular_velocity_rad_s"] = [0, 0, 0]
        return self.code


class Sport:
    def __init__(self, sdk):
        self.sdk = sdk
        self.fail_move = False
        self.fail_zero = False

    def Move(self, vx, vy, vyaw):
        self.sdk.calls.append(("SportMove", vx, vy, vyaw))
        self.sdk.velocity = [vx, vy, vyaw]
        self.sdk.snapshot["velocity_m_s"] = [vx, vy, 0]
        self.sdk.snapshot["imu_angular_velocity_rad_s"] = [0, 0, vyaw]
        if self.fail_move and any((vx, vy, vyaw)):
            raise RuntimeError("Uncertain direct transmission")
        return 3102 if self.fail_zero and not any((vx, vy, vyaw)) else 0


@pytest.fixture
def rig(monkeypatch):
    sdk = MovingSDK()
    clock = SimpleNamespace(now=100.0, on_sleep=None)

    def sleep(seconds):
        clock.now += seconds
        if sdk.observed_motion:
            sdk.snapshot["position_m"] = [
                sdk.snapshot["position_m"][0] + sdk.velocity[0] * seconds,
                sdk.snapshot["position_m"][1] + sdk.velocity[1] * seconds,
                0,
            ]
            sdk.snapshot["imu_rpy_rad"] = [0, 0, sdk.snapshot["imu_rpy_rad"][2] + sdk.velocity[2] * seconds]
        if clock.on_sleep:
            callback, clock.on_sleep = clock.on_sleep, None
            callback()

    monkeypatch.setattr(motion, "time", SimpleNamespace(monotonic=lambda: clock.now, sleep=sleep))
    return sdk, Go2(sdk, allow_motion=True), clock


@pytest.fixture
def direct_rig(rig):
    sdk, go2, clock = rig
    sdk.client = Sport(sdk)
    go2.use_avoidance = False
    return sdk, go2, clock


def values(result):
    return json.loads(result["blocks"][0]["text"])


def test_timed_movement_uses_avoidance_and_stops_with_measured_result(rig):
    sdk, go2, clock = rig
    result = go2.write("move", {"vx": 0.2, "duration_s": 0.5})
    assert result["ok"]
    assert values(result)["simulation"] is False
    assert values(result)["measured_displacement_start_body_m"][0] == pytest.approx(0.1)
    assert sdk.calls[:2] == ["SwitchGet", ("UseRemoteCommandFromApi", True)]
    assert sdk.calls[-3:] == [("Move", 0, 0, 0), "StopMove", ("UseRemoteCommandFromApi", False)]
    assert not go2.busy and not go2.avoid_control_attempted
    assert 101 <= clock.now < 102


def test_disabled_avoidance_is_enabled_and_verified_before_control(rig):
    sdk, go2, _ = rig
    sdk.avoid.enabled = False
    go2.write("move", {"vx": 0.2, "duration_s": 0.5})
    assert sdk.calls[:4] == ["SwitchGet", ("SwitchSet", True), "SwitchGet", ("UseRemoteCommandFromApi", True)]


def test_unavailable_avoidance_sends_no_control_or_fallback_commands(rig):
    sdk, go2, _ = rig
    sdk.avoid.codes["SwitchGet"] = 3104
    with pytest.raises(MhsError, match="3104"):
        go2.write("move", {"vx": 0.2})
    assert sdk.calls == ["SwitchGet"]
    assert not go2.busy


def test_uncertain_control_acquisition_is_zeroed_stopped_and_released(rig):
    sdk, go2, _ = rig
    sdk.avoid.codes[("UseRemoteCommandFromApi", True)] = 3104
    with pytest.raises(MhsError, match="3104"):
        go2.write("move", {"vx": 0.2})
    assert sdk.calls[-3:] == [("Move", 0, 0, 0), "StopMove", ("UseRemoteCommandFromApi", False)]
    assert not any(isinstance(x, tuple) and x[0] == "Move" and any(x[1:]) for x in sdk.calls)


def test_sdk_transmission_alone_does_not_prove_motion(rig):
    sdk, go2, _ = rig
    sdk.observed_motion = False
    result = go2.write("move", {"vx": 0.2, "duration_s": 0.5})
    assert not result["ok"]
    assert values(result)["result"] == "no_measurable_motion"
    assert values(result)["obstacle_blocked"] is None


def test_stop_cancels_move_without_later_nonzero_velocity(rig):
    sdk, go2, clock = rig
    clock.on_sleep = lambda: go2.write("stop", {})
    result = go2.write("move", {"vx": 0.2, "duration_s": 1})
    assert not result["ok"] and values(result)["result"] == "interrupted"
    stopped_at = sdk.calls.index("StopMove")
    assert all(
        not (isinstance(x, tuple) and x[0] == "Move" and any(x[1:])) for x in sdk.calls[stopped_at + 1 :]
    )
    assert not go2.stop_in_progress


def test_stop_attempts_remaining_cleanup_even_when_zero_command_fails(rig):
    sdk, go2, _ = rig
    sdk.avoid.codes["Zero"] = 3102
    with pytest.raises(MhsError, match="stop_failed|Damp"):
        go2.write("move", {"vx": 0.2, "duration_s": 0.5})
    assert "StopMove" in sdk.calls
    assert ("UseRemoteCommandFromApi", False) in sdk.calls
    assert sdk.calls[-1] == "Damp" and go2.estopped


@pytest.mark.parametrize(
    "params", [{"vx": True}, {"vy": float("nan")}, {"vx": 0.91}, {"duration_s": 5.1}, {"goal_x": 1}]
)
def test_motion_rejects_bad_parameters_before_any_sdk_call(rig, params):
    sdk, go2, _ = rig
    with pytest.raises(MhsError):
        go2.write("move", params)
    assert sdk.calls == []


@pytest.mark.parametrize("capability,params", [("move", {"vx": 0.2}), ("move", {}), ("stop", {})])
def test_read_only_mode_never_sends_move_stop_or_switch(rig, capability, params):
    sdk, go2, _ = rig
    go2.allow_motion = False
    with pytest.raises(MhsError, match="disabled"):
        go2.write(capability, params)
    assert sdk.calls == []


def test_selected_jump_gait_is_not_silently_changed_to_walk(rig):
    sdk, go2, _ = rig
    sdk.snapshot["sport_error_code"] = 2009
    with pytest.raises(MhsError, match="ordinary"):
        go2.write("move", {"vx": 0.2})
    assert sdk.calls == []


def test_movement_is_blocked_until_an_existing_stop_finishes(rig):
    sdk, go2, _ = rig
    go2.stop_in_progress = True
    with pytest.raises(MhsError, match="stop"):
        go2.write("move", {"vx": 0.2})
    assert sdk.calls == []


def test_state_loss_after_stop_latches_and_requests_damping(rig):
    sdk, go2, _ = rig
    original_state = sdk.state

    def state():
        if "StopMove" in sdk.calls:
            raise MhsError(503, "stale_dds_state", "State lost after stop")
        return original_state()

    sdk.state = state
    with pytest.raises(MhsError, match="State lost after stop"):
        go2.write("move", {"vx": 0.2, "duration_s": 0.5})
    assert sdk.calls[-1] == "Damp"
    assert go2.estopped and not go2.busy


def test_estop_during_control_handoff_releases_api_without_starting_movement(rig):
    sdk, go2, clock = rig
    clock.on_sleep = lambda: go2.reset({"mode": "estop"})
    result = go2.write("move", {"vx": 0.2, "duration_s": 0.5})
    assert not result["ok"]
    assert values(result)["result"] == "interrupted"
    assert sdk.calls[-3:] == [("Move", 0, 0, 0), "Damp", ("UseRemoteCommandFromApi", False)]
    assert not any(isinstance(x, tuple) and x[0] == "Move" and any(x[1:]) for x in sdk.calls)
    assert go2.estopped and not go2.avoid_control_attempted


def test_reading_avoidance_during_motion_cannot_delay_velocity_renewal(rig):
    sdk, go2, _ = rig
    go2.busy = True
    with pytest.raises(MhsError, match="paused"):
        go2.read("avoidance", {})
    assert sdk.calls == []


@pytest.mark.parametrize("enabled", [True, False])
def test_direct_mode_confirms_avoidance_off_and_stops_correct_client(direct_rig, enabled):
    sdk, go2, _ = direct_rig
    sdk.avoid.enabled = enabled
    result = go2.write("move", {"vx": 0.4, "duration_s": 0.5})
    assert result["ok"]
    assert values(result)["sdk"] == "SportClient"
    assert values(result)["obstacle_avoidance_enabled"] is False
    assert values(result)["measured_displacement_start_body_m"][0] == pytest.approx(0.2)
    prefix = ["SwitchGet"]
    if enabled:
        prefix += [("SwitchSet", False), "SwitchGet"]
    prefix += [("UseRemoteCommandFromApi", False)]
    assert sdk.calls[: len(prefix)] == prefix
    assert sdk.calls[-2:] == [("SportMove", 0, 0, 0), "StopMove"]
    assert not any(isinstance(call, tuple) and call[0] == "Move" for call in sdk.calls)
    assert not go2.busy and not go2.direct_control_attempted
    assert go2.state()["move_avoidance_enabled"] is False
    assert "Native avoidance DISABLED" in go2.meta()["description"]


@pytest.mark.parametrize("failure", ["query", "set", "readback"])
def test_direct_mode_requires_confirmed_disabled_avoidance(direct_rig, failure):
    sdk, go2, _ = direct_rig
    if failure == "query":
        sdk.avoid.codes["SwitchGet"] = 3104
    elif failure == "set":
        sdk.avoid.codes["SwitchSet"] = 3104
    else:
        sdk.avoid.SwitchGet = lambda: (0, True)
    with pytest.raises(MhsError):
        go2.write("move", {"vx": 0.2})
    assert not any(isinstance(call, tuple) and call[0] == "SportMove" for call in sdk.calls)
    assert not go2.busy


def test_uncertain_direct_move_is_zeroed_and_stopped(direct_rig):
    sdk, go2, _ = direct_rig
    sdk.client.fail_move = True
    with pytest.raises(RuntimeError, match="Uncertain direct"):
        go2.write("move", {"vx": 0.2})
    assert sdk.calls[-2:] == [("SportMove", 0, 0, 0), "StopMove"]
    assert not go2.busy and not go2.direct_control_attempted


def test_failed_direct_zero_still_stops_and_latches(direct_rig):
    sdk, go2, _ = direct_rig
    sdk.client.fail_zero = True
    with pytest.raises(MhsError, match="stop_failed|Damp"):
        go2.write("move", {"vx": 0.2, "duration_s": 0.5})
    assert sdk.calls[-3:] == [("SportMove", 0, 0, 0), "StopMove", "Damp"]
    assert go2.estopped


@pytest.mark.parametrize("estop", [False, True])
def test_direct_motion_cancellation_prevents_later_velocity(direct_rig, estop):
    sdk, go2, clock = direct_rig

    def after_handoff():
        clock.on_sleep = lambda: go2.reset({"mode": "estop"}) if estop else go2.write("stop", {})

    clock.on_sleep = after_handoff
    result = go2.write("move", {"vx": 0.2, "duration_s": 1})
    assert not result["ok"] and values(result)["result"] == "interrupted"
    stop_at = sdk.calls.index("Damp" if estop else "StopMove")
    assert sdk.calls[stop_at - 1] == ("SportMove", 0, 0, 0)
    assert not any(
        isinstance(call, tuple) and call[0] == "SportMove" and any(call[1:])
        for call in sdk.calls[stop_at + 1 :]
    )
    assert not go2.busy and not go2.direct_control_attempted
