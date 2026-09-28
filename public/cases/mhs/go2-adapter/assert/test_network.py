"""LAN exposure must require authentication before any SDK is constructed."""

import threading
from http.client import HTTPConnection
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.error import HTTPError

import msgpack
import pytest

import adapter
import mhs_move
from adapter_server import AdapterServer
from device import Go2
from network import read_token
from test_adapter import FakeSDK


@pytest.fixture
def token_file(tmp_path):
    path = tmp_path / "bearer"
    path.write_text("offline-test-token-with-at-least-32-characters\n")
    path.chmod(0o600)
    return path


@pytest.mark.parametrize("bind", ["0.0.0.0", "192.0.2.10", "198.51.100.10"])
def test_lan_without_token_fails_before_sdk(monkeypatch, bind):
    sdk = Mock(side_effect=AssertionError("SDK must not start"))
    monkeypatch.setattr(adapter, "SDK", sdk)
    with pytest.raises(SystemExit) as error:
        adapter.main(["--bind", bind])
    assert error.value.code == 2
    sdk.assert_not_called()


@pytest.mark.parametrize("contents", ["", "short", "x" * 32 + "\ny", "é" * 32])
def test_bad_token_fails_before_sdk(monkeypatch, token_file, contents):
    token_file.write_text(contents)
    sdk = Mock(side_effect=AssertionError("SDK must not start"))
    monkeypatch.setattr(adapter, "SDK", sdk)
    with pytest.raises(SystemExit):
        adapter.main(["--bind", "0.0.0.0", "--token-file", str(token_file)])
    sdk.assert_not_called()


def test_group_or_world_readable_token_is_refused(token_file):
    token_file.chmod(0o644)
    with pytest.raises(ValueError, match="chmod 600"):
        read_token(token_file)


@pytest.mark.parametrize(
    "extra,enabled,avoidance", [([], False, True), (["--allow-motion", "--without-avoidance"], True, False)]
)
def test_authenticated_binding_preserves_explicit_motion_mode(
    monkeypatch, token_file, capsys, extra, enabled, avoidance
):
    sdk = FakeSDK()
    observed = {}
    server = SimpleNamespace(serve_forever=Mock(), server_close=Mock())

    def create_server(address, devices, **kwargs):
        observed.update(address=address, device=devices[0], token=kwargs["token"])
        return server

    monkeypatch.setattr(adapter, "SDK", lambda interface: sdk)
    monkeypatch.setattr(adapter, "AdapterServer", create_server)
    monkeypatch.setattr(adapter.signal, "signal", lambda *_: None)
    assert adapter.main(["--bind", "0.0.0.0", "--token-file", str(token_file), *extra]) == 0
    assert observed["address"] == ("0.0.0.0", 8803)
    assert observed["token"] == read_token(token_file)
    assert observed["device"].allow_motion is enabled
    assert observed["device"].use_avoidance is avoidance
    assert sdk.calls == []
    assert read_token(token_file) not in capsys.readouterr().out
    server.server_close.assert_called_once()


def test_loopback_start_stays_read_only_without_token(monkeypatch):
    seen = {}
    sdk = FakeSDK()

    def create_server(address, devices, **kwargs):
        seen.update(address=address, device=devices[0], token=kwargs["token"])
        return SimpleNamespace(serve_forever=lambda: None, server_close=lambda: None)

    monkeypatch.setattr(adapter, "SDK", lambda interface: sdk)
    monkeypatch.setattr(adapter, "AdapterServer", create_server)
    monkeypatch.setattr(adapter.signal, "signal", lambda *_: None)
    adapter.main([])
    assert seen["address"] == ("127.0.0.1", 8803)
    assert seen["token"] is None and not seen["device"].allow_motion
    assert sdk.calls == []


@pytest.fixture
def authenticated_server(token_file):
    sdk = FakeSDK()
    sdk.avoidance_state = lambda: {"available": True, "enabled": True, "sdk_code": 0}
    server = AdapterServer(("127.0.0.1", 0), [Go2(sdk)], token=read_token(token_file))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server, sdk
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


@pytest.mark.parametrize("authorization", [None, "Bearer wrong"])
def test_missing_or_wrong_token_cannot_read_or_actuate(authenticated_server, authorization):
    server, sdk = authenticated_server
    for method, suffix in [("GET", ""), ("POST", "/go2/write/move"), ("POST", "/go2/reset")]:
        connection = HTTPConnection(*server.server_address, timeout=3)
        headers = {"Content-Type": "application/msgpack"}
        if authorization:
            headers["Authorization"] = authorization
        try:
            connection.request(method, "/mhs/v1/devices" + suffix, body=msgpack.packb({}), headers=headers)
            response = connection.getresponse()
            payload = msgpack.unpackb(response.read(), raw=False)
            assert response.status == 401 and payload["error"]["code"] == "unauthorized"
        finally:
            connection.close()
    assert sdk.calls == []


def test_cli_authenticated_status_works_and_writes_keep_read_only_guard(authenticated_server, token_file):
    server, sdk = authenticated_server
    client = mhs_move.Client(f"http://127.0.0.1:{server.server_port}", token=read_token(token_file))
    status = mhs_move.run(mhs_move.parser().parse_args(["status"]), client)
    assert status["health"]["healthy"] is True
    assert status["avoidance"]["blocks"]
    with pytest.raises(HTTPError) as error:
        client.stop()
    assert error.value.code == 403
    error.value.close()
    assert sdk.calls == []
