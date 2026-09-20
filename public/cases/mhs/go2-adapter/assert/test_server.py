"""Go2 must obey the same HTTP contract without constructing a real SDK."""

import json
import threading
from http.client import HTTPConnection

import msgpack
import pytest

from adapter_server import AdapterServer
from device import Go2
from test_adapter import FakeSDK


@pytest.fixture
def server():
    sdk = FakeSDK()
    http = AdapterServer(("127.0.0.1", 0), [Go2(sdk)])
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    try:
        yield http, sdk
    finally:
        http.shutdown()
        http.server_close()
        thread.join(timeout=5)


def request(server, method, suffix, params=None):
    connection = HTTPConnection(*server.server_address, timeout=3)
    try:
        connection.request(
            method,
            "/mhs/v1/devices" + suffix,
            body=msgpack.packb(params or {}, use_bin_type=True) if method == "POST" else None,
            headers={"Content-Type": "application/msgpack"},
        )
        response = connection.getresponse()
        return response.status, msgpack.unpackb(response.read(), raw=False)
    finally:
        connection.close()


def test_go2_discovery_and_read_only_commands_use_shared_server(server):
    http, sdk = server
    status, body = request(http, "GET", "")
    assert status == 200 and body["devices"][0]["device_id"] == "go2"
    status, body = request(http, "POST", "/go2/read/state")
    assert status == 200 and json.loads(body["blocks"][0]["text"])["motion_enabled"] is False
    status, body = request(http, "POST", "/go2/write/move", {"vx": 0.1})
    assert status == 403 and body["error"]["code"] == "read_only"
    status, body = request(http, "POST", "/go2/reset", {"mode": "estop"})
    assert status == 405 and body["error"]["code"] == "read_only"
    assert sdk.calls == []


def test_unknown_device_and_capability_are_protocol_errors(server):
    http, sdk = server
    status, body = request(http, "GET", "/missing")
    assert status == 404 and body["error"]["code"] == "unknown_device"
    status, body = request(http, "POST", "/go2/read/missing")
    assert status == 404 and body["error"]["code"] == "unknown_capability"
    assert sdk.calls == []
