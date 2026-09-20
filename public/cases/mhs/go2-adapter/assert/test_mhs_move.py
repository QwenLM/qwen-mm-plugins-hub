import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import msgpack
import pytest

import mhs_move
from adapter_server import AdapterServer
from test_motion import direct_rig as direct_motion_rig
from test_motion import rig as motion_rig
from test_motion import values

rig = motion_rig
direct_rig = direct_motion_rig


@pytest.fixture
def live_client(direct_rig):
    sdk, go2, _ = direct_rig
    sdk.avoidance_state = lambda: {"available": True, "enabled": sdk.avoid.enabled, "sdk_code": 0}
    server = AdapterServer(("127.0.0.1", 0), [go2])
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield mhs_move.Client(f"http://127.0.0.1:{server.server_port}"), sdk
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def test_cli_parameters_reach_running_adapter_and_inherit_direct_mode(live_client):
    client, sdk = live_client
    args = mhs_move.parser().parse_args(
        ["move", "--vx", "0.2", "--vy", "-0.1", "--vyaw", "0.1", "--duration-s", "0.5"]
    )
    result = mhs_move.run(args, client)
    assert result["ok"]
    assert values(result)["requested_velocity"] == {"vx": 0.2, "vy": -0.1, "vyaw": 0.1}
    assert values(result)["requested_duration_s"] == 0.5
    assert values(result)["sdk"] == "SportClient"
    assert values(result)["obstacle_avoidance_enabled"] is False
    assert sdk.calls[-2:] == [("SportMove", 0, 0, 0), "StopMove"]


def test_cli_reads_live_limits_before_sending_velocity(live_client):
    client, sdk = live_client
    args = mhs_move.parser().parse_args(["move", "--vx", "0.91"])
    with pytest.raises(ValueError, match="vx must"):
        mhs_move.run(args, client)
    assert sdk.calls == []


def test_cli_status_never_moves_and_stop_uses_separate_endpoint(live_client):
    client, sdk = live_client
    status = mhs_move.run(mhs_move.parser().parse_args(["status"]), client)
    assert status["health"]["healthy"]
    assert sdk.calls == []
    result = mhs_move.run(mhs_move.parser().parse_args(["stop"]), client)
    assert values(result)["result"] == "stopped"
    assert sdk.calls == ["StopMove"]


@pytest.mark.parametrize("error", [KeyboardInterrupt, TimeoutError])
def test_cli_interrupted_response_stops_without_retrying_movement(live_client, error):
    client, sdk = live_client
    request = client.request

    def interrupted_request(path, params=None, timeout=15):
        response = request(path, params, timeout)
        if path == "/write/move":
            raise error()
        return response

    client.request = interrupted_request
    args = mhs_move.parser().parse_args(["move", "--vx", "0.2", "--duration", "0.5"])
    with pytest.raises(error):
        mhs_move.run(args, client)
    assert sdk.calls[-1] == "StopMove"
    assert sdk.calls.count(("UseRemoteCommandFromApi", False)) == 1


@pytest.mark.parametrize("payload", [{}, {"ok": None}, {"ok": 0}, {"ok": 1}, {"ok": "false"}])
@pytest.mark.parametrize("path", ["/write/move", "/write/stop"])
def test_cli_does_not_treat_missing_or_invalid_acknowledgements_as_success(payload, path):
    calls = []

    class Reply(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            calls.append(self.path)
            self.rfile.read(int(self.headers["Content-Length"]))
            body = msgpack.packb(payload, use_bin_type=True)
            self.send_response(200)
            self.send_header("Content-Type", "application/msgpack")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Reply)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        client = mhs_move.Client(f"http://127.0.0.1:{server.server_port}")
        with pytest.raises(ValueError, match="execution is unconfirmed"):
            client.request(path, {})
        assert calls == ["/mhs/v1/devices/go2" + path]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
