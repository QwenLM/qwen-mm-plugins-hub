"""Bounded movement with an explicit choice of Unitree velocity client."""

import math
import time


# Same parameter names and body-frame convention as the simulation adapter.
MOVE_LIMITS = {"vx": (-0.9, 0.9), "vy": (-0.9, 0.9), "vyaw": (-1.0, 1.0), "duration_s": (0.5, 5.0)}


def move_params(params, error):
    if set(params) - set(MOVE_LIMITS):
        raise error(400, "bad_parameter", "move accepts only vx, vy, vyaw and duration_s")
    values = []
    for name, (lower, upper) in MOVE_LIMITS.items():
        value = params.get(name, 2.0 if name == "duration_s" else 0.0)
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
            raise error(400, "bad_parameter", f"{name} must be a finite number")
        if not lower <= value <= upper:
            raise error(400, "hard_limit", f"{name} must be within [{lower}, {upper}]")
        values.append(float(value))
    return values


class MotionMixin:
    """Uses the adapter's existing operation lock, state checks and stop client."""

    def _checked_sdk(self, code, api):
        if code != 0:
            raise self.error(502, "sdk_error", f"{api} returned SDK code {code}")

    def _motion_call(self, generation, call):
        # Serialise SDK commands with cancellation: no new Move may follow stop.
        with self.motion_io:
            with self.lock:
                if generation != self.generation or self.estopped:
                    raise self.error(409, "interrupted", "Movement was cancelled")
            return call()

    def _finish_move_sdk(self, force_stop=False):
        with self.motion_io:
            failures = []
            controlled = self.avoid_control_attempted
            direct = self.direct_control_attempted
            calls = []
            if controlled:
                calls.append(("ObstaclesAvoidClient.Move(0,0,0)", lambda: self.sdk.avoid.Move(0, 0, 0)))
            if direct:
                calls.append(("SportClient.Move(0,0,0)", lambda: self.sdk.client.Move(0, 0, 0)))
            if controlled or direct or force_stop:
                calls.append(
                    (
                        "Damp" if self.estopped else "StopMove",
                        self.sdk.stop if self.estopped else self.sdk.soft,
                    )
                )
            if controlled:
                calls.append(
                    ("UseRemoteCommandFromApi(False)", lambda: self.sdk.avoid.UseRemoteCommandFromApi(False))
                )
            for name, call in calls:
                try:
                    code = call()
                    if code != 0:
                        failures.append(f"{name}: {code}")
                except Exception as exc:
                    failures.append(f"{name}: {exc}")
            self.avoid_control_attempted = False
            self.direct_control_attempted = False
            if failures:
                with self.lock:
                    self.estopped = True
                try:
                    damp = self.sdk.stop()
                except Exception as exc:
                    damp = str(exc)
                raise self.error(502, "stop_failed", f"{'; '.join(failures)}; Damp result: {damp}")

    def _settle_move(self):
        try:
            return self._observe_settling()
        except Exception as exc:
            with self.lock:
                self.estopped = True
            with self.motion_io:
                try:
                    code = self.sdk.stop()
                except Exception as stop_exc:
                    code = str(stop_exc)
            raise self.error(504, "stop_unverified", f"{exc}; Damp result: {code}") from exc

    def _observe_settling(self):
        deadline, quiet_since = time.monotonic() + 2.0, None
        while time.monotonic() < deadline:
            state = self.state()
            quiet = (
                math.hypot(*state["velocity_m_s"][:2]) < 0.08
                and abs(state["imu_angular_velocity_rad_s"][2]) < 0.15
                and max(map(abs, state["joint_velocity_rad_s"])) < 0.7
            )
            now = time.monotonic()
            quiet_since = (quiet_since or now) if quiet else None
            if quiet_since is not None and now - quiet_since >= 0.3:
                return state
            time.sleep(0.03)
        raise self.error(504, "stop_unverified", "Measured motion did not settle")

    def stop_motion(self, params):
        if params:
            raise self.error(400, "bad_parameter", "stop takes no parameters")
        if not self.allow_motion:
            raise self.error(403, "read_only", "Motion is disabled in this adapter process")
        with self.lock:
            if self.stop_in_progress:
                raise self.error(409, "stopping", "Another stop is in progress")
            if self.busy and not self.motion_active:
                raise self.error(
                    409, "posture_active", "A posture transition is active; use estop to cancel it"
                )
            self.stop_in_progress = True
            self.generation += 1
        try:
            self._finish_move_sdk(force_stop=True)
            after = self._settle_move()
            return self.result(
                True, "maintenance" if self.estopped else "online", result="stopped", measured_state=after
            )
        finally:
            with self.lock:
                self.stop_in_progress = False

    def move(self, params):
        vx, vy, vyaw, duration = move_params(params, self.error)
        if not self.allow_motion:
            raise self.error(403, "read_only", "Motion is disabled in this adapter process")
        if not any((vx, vy, vyaw)):
            return self.stop_motion({})
        if not self.operation.acquire(blocking=False):
            raise self.error(409, "busy", "Another motion is active; stop or estop to cancel it")
        generation = None
        try:
            before = self.state(refresh_controller=True)
            self.preflight(before)
            if before["motion_state"] not in {"free_walk", "joint_lock", "balance_stand", "free_avoid"}:
                raise self.error(
                    409, "unsupported_gait", "Select ordinary standing/walking mode before moving"
                )
            if not 0.18 <= before["body_height_m"] <= 0.5 or max(map(abs, before["imu_rpy_rad"][:2])) > 0.35:
                raise self.error(409, "not_standing", "A stable standing posture is required")
            with self.lock:
                if self.stop_in_progress:
                    raise self.error(409, "stopping", "Wait for the current stop to finish")
                if self.estopped:
                    raise self.error(409, "estop_latched", "Stop is latched; inspect and soft reset first")
                self.generation += 1
                generation = self.generation
                self.busy = self.motion_active = True
                self.last_command = "move"

            # The process option selects the route. A failed avoidance query
            # must not silently select direct movement or change gait.
            def configure_avoidance():
                code, enabled = self.sdk.avoid.SwitchGet()
                self._checked_sdk(code, "ObstaclesAvoidClient.SwitchGet")
                if enabled not in (True, False, 0, 1):
                    raise self.error(
                        502, "invalid_avoidance_state", "Avoidance returned an invalid enable flag"
                    )
                if bool(enabled) != self.use_avoidance:
                    self._checked_sdk(
                        self.sdk.avoid.SwitchSet(self.use_avoidance),
                        f"ObstaclesAvoidClient.SwitchSet({self.use_avoidance})",
                    )
                    code, enabled = self.sdk.avoid.SwitchGet()
                    self._checked_sdk(code, "ObstaclesAvoidClient.SwitchGet")
                if enabled not in (True, False, 0, 1) or bool(enabled) != self.use_avoidance:
                    raise self.error(
                        502, "avoidance_mismatch", "Robot did not confirm requested avoidance state"
                    )

            self._motion_call(generation, configure_avoidance)

            def acquire_control():
                self.avoid_control_attempted = self.use_avoidance
                self._checked_sdk(
                    self.sdk.avoid.UseRemoteCommandFromApi(self.use_avoidance),
                    f"UseRemoteCommandFromApi({self.use_avoidance})",
                )

            self._motion_call(generation, acquire_control)
            # The vendor example gives API command ownership 0.5 s to settle.
            time.sleep(0.5)
            client = self.sdk.avoid if self.use_avoidance else self.sdk.client
            client_name = "ObstaclesAvoidClient" if self.use_avoidance else "SportClient"

            def send_velocity():
                # Mark before sending: an exception may still have delivered Move.
                if not self.use_avoidance:
                    self.direct_control_attempted = True
                self._checked_sdk(client.Move(vx, vy, vyaw), f"{client_name}.Move")

            started = time.monotonic()
            interrupted = False
            while time.monotonic() - started < duration:
                with self.lock:
                    if generation != self.generation:
                        interrupted = True
                        break
                actual = self.state()
                self.preflight(actual, stationary=False)
                if max(map(abs, actual["imu_rpy_rad"][:2])) > 0.6:
                    raise self.error(409, "robot_tilted", "Body tilt increased during movement")
                if actual["motion_state"] not in {
                    "free_walk",
                    "joint_lock",
                    "balance_stand",
                    "free_avoid",
                    "move",
                }:
                    raise self.error(409, "gait_changed", "Motion mode changed during movement")
                self._motion_call(generation, send_velocity)
                self.move_command_count += 1
                time.sleep(min(0.05, max(0.0, duration - (time.monotonic() - started))))
            commanded_for = time.monotonic() - started
            self._finish_move_sdk()
            after = self._settle_move()
            delta = [b - a for a, b in zip(before["position_m"], after["position_m"])]
            start_yaw = before["imu_rpy_rad"][2]
            yaw_delta = after["imu_rpy_rad"][2] - start_yaw
            yaw_delta = math.atan2(math.sin(yaw_delta), math.cos(yaw_delta))
            body_delta = [
                math.cos(start_yaw) * delta[0] + math.sin(start_yaw) * delta[1],
                -math.sin(start_yaw) * delta[0] + math.cos(start_yaw) * delta[1],
            ]
            observed = math.hypot(*body_delta) > 0.015 if math.hypot(vx, vy) > 0 else abs(yaw_delta) > 0.02
            return self.result(
                observed and not interrupted,
                "maintenance" if self.estopped else "online",
                result="interrupted" if interrupted else "completed" if observed else "no_measurable_motion",
                requested_velocity={"vx": vx, "vy": vy, "vyaw": vyaw},
                requested_duration_s=duration,
                commanded_for_s=commanded_for,
                measured_displacement_world_m=delta,
                measured_displacement_start_body_m=body_delta,
                measured_yaw_change_rad=yaw_delta,
                final_velocity_m_s=after["velocity_m_s"],
                obstacle_avoidance_enabled=self.use_avoidance,
                obstacle_blocked=None,
                sdk=client_name,
                simulation=False,
            )
        finally:
            try:
                # A timed-out request may already have enabled API control.
                if self.avoid_control_attempted or self.direct_control_attempted:
                    self._finish_move_sdk()
                    self._settle_move()
            finally:
                with self.lock:
                    self.busy = self.motion_active = False
                self.operation.release()
