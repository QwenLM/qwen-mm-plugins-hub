"""Go2 motion-state decoding and physical readiness checks."""

import math

from adapter_server import MhsError

# MCF stores its FSM state in error_code. Keep the raw field in observations.
# Mapping provenance and the observed firmware are recorded in README.md.

MCF_STATES = {
    0: "idle",
    100: "free_walk",
    1001: "damping",
    1002: "joint_lock",
    1004: "lie_down",
    1005: "move",
    1006: "hello",
    1007: "sit",
    1013: "balance_stand",
    1015: "walk",
    1016: "run",
    1017: "battery_life",
    1091: "pose",
    2007: "free_avoid",
    2008: "free_bound",
    2009: "free_jump",
    2010: "stair",
    2011: "hand_stand",
    2016: "cross_step",
    2017: "back_stand",
    2019: "lead_follow",
    2021: "rage_mode",
}


LEGACY_STATES = {
    0: "idle",
    1: "balance_stand",
    2: "pose",
    3: "move",
    5: "lie_down",
    6: "joint_lock",
    7: "damping",
    8: "recovery_stand",
    9: "free_walk",
    10: "sit",
    15: "free_bound",
    16: "free_jump",
    17: "free_avoid",
}


def motion_state(state):
    if state.get("motion_controller") == "mcf":
        return MCF_STATES.get(state["sport_error_code"], "unknown")
    return LEGACY_STATES.get(state["sport_mode"], "unknown")


def state_problem(state):
    if state.get("motion_controller") not in {"mcf", "normal", "advanced", "ai", "ai-w"}:
        return "Motion controller could not be queried"
    if state.get("controller_age_s", 0) > 30:
        return "Motion-controller observation is stale"
    if state["motion_controller"] == "mcf":
        if motion_state(state) == "unknown":
            return "Unrecognised MCF motion state"
    elif state["sport_error_code"]:
        return "Robot reports an unrecognised sport error/status code"
    if any(state.get("motor_fault_flags", [])):
        return "A motor reports a fault flag"
    values = (
        state["imu_rpy_rad"]
        + state["velocity_m_s"]
        + state["position_m"]
        + state["joint_position_rad"]
        + state["joint_velocity_rad_s"]
        + state["imu_angular_velocity_rad_s"]
        + [state["body_height_m"], state["yaw_speed_rad_s"]]
    )
    if not all(math.isfinite(v) for v in values):
        return "Non-finite physical state"
    if state.get("battery_percent", 100) < 20:
        return "Battery is below the adapter's 20% motion limit"
    if max(state.get("motor_temperature_c", []), default=0) >= 75:
        return "Motor temperature reached the adapter's 75 C motion limit"
    return None


def validate_pose(params):
    if set(params) != {"pose"} or params["pose"] not in ("stand", "sit"):
        raise MhsError(
            400, "bad_parameter", "Only pose=stand or pose=sit is accepted; no custom joint commands"
        )
    return params["pose"]


def measured_completion(pose, state):
    quiet = max(abs(v) for v in state["joint_velocity_rad_s"]) < 0.25
    quiet = quiet and max(abs(v) for v in state["imu_angular_velocity_rad_s"]) < 0.15
    if pose == "sit":
        return motion_state(state) == "sit" and quiet
    standing = motion_state(state) in {"joint_lock", "balance_stand", "free_walk"}
    if state.get("motion_controller") != "mcf":
        standing = state["sport_mode"] in (0, 1, 6)
    return (
        standing
        and (0.18 if state.get("motion_controller") == "mcf" else 0.25) <= state["body_height_m"] <= 0.50
        and max(abs(v) for v in state["imu_rpy_rad"][:2]) < 0.35
        and quiet
    )
