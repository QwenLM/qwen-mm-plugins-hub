"""Parameterised operator CLI for the running Go2 MHS adapter (HTTP + MessagePack)."""

import argparse
import json
import math
import signal
import sys
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

import msgpack

from network import read_token


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, url, token=None):
        self.base = url.rstrip("/") + "/mhs/v1/devices/go2"
        self.token = token
        self.opener = build_opener(ProxyHandler({}), NoRedirect())

    def request(self, path, params=None, timeout=15):
        headers = {"Content-Type": "application/msgpack"}
        if self.token is not None:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(
            self.base + path,
            data=None if params is None else msgpack.packb(params, use_bin_type=True),
            headers=headers,
        )
        with self.opener.open(request, timeout=timeout) as response:
            if response.headers.get_content_type() != "application/msgpack":
                raise ValueError("Adapter response must use application/msgpack")
            body = response.read(15 * 1024 * 1024 + 1)
            if len(body) > 15 * 1024 * 1024:
                raise ValueError("Adapter response exceeds 15 MiB")
            result = msgpack.unpackb(body, raw=False)
        if not isinstance(result, dict):
            raise ValueError("Adapter response must be a MessagePack map")
        if path.startswith("/write/") and not isinstance(result.get("ok"), bool):
            raise ValueError("Adapter response must contain boolean 'ok'; execution is unconfirmed")
        return result

    def stop(self):
        return self.request("/write/stop", {}, timeout=6)


def finite_number(text):
    value = float(text)
    if not math.isfinite(value):
        raise argparse.ArgumentTypeError("must be a finite number")
    return value


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument(
        "--url",
        default="http://127.0.0.1:8803",
        help="adapter base URL; use http://127.0.0.1:18803 with the Mac SSH tunnel",
    )
    result.add_argument("--token-file", help="Private bearer-token file for a LAN adapter")
    actions = result.add_subparsers(dest="action", required=True)
    move = actions.add_parser("move", help="send one bounded movement, then stop automatically")
    move.add_argument("--vx", type=finite_number, default=0.0, help="forward m/s; negative is backward")
    move.add_argument("--vy", type=finite_number, default=0.0, help="left m/s; negative is right")
    move.add_argument("--vyaw", type=finite_number, default=0.0, help="counterclockwise rad/s")
    move.add_argument("--duration", "--duration-s", type=finite_number, default=1.0, help="seconds")
    actions.add_parser("stop", help="cancel adapter movement and wait for measured settling")
    actions.add_parser("status", help="show health, state and native avoidance without moving")
    return result


def run(args, client):
    if args.action == "stop":
        return client.stop()
    if args.action == "status":
        return {
            "health": client.request("/health"),
            "state": client.request("/read/state", {}),
            "avoidance": client.request("/read/avoidance", {}),
        }
    params = {"vx": args.vx, "vy": args.vy, "vyaw": args.vyaw, "duration_s": args.duration}
    metadata = client.request("")
    # Read live ranges so a client cannot drift behind the deployed adapter.
    for limit in metadata.get("safety_limits", []):
        name = limit["parameter"]
        if name in params and not limit["min"] <= params[name] <= limit["max"]:
            raise ValueError(f"{name} must be in [{limit['min']}, {limit['max']}]")
    health = client.request("/health")
    if not health.get("healthy"):
        raise ValueError(f"Adapter is not healthy: {health}")
    move = next(cap for cap in metadata["capabilities"] if cap["name"] == "move")
    if move["direction"] not in ("write", "both"):
        raise ValueError("Adapter movement is disabled")
    print(move["description"], flush=True)
    print("Sending:", json.dumps(params), flush=True)
    try:
        return client.request("/write/move", params, timeout=args.duration + 10)
    except BaseException:
        # A timeout/interruption may occur after the server accepted the move.
        # Stop over a new HTTP request; never retry nonzero velocity.
        try:
            stopped = client.stop()
            print("Stop after interruption:", json.dumps(stopped), file=sys.stderr, flush=True)
        except BaseException as exc:
            print(f"Stop could not be confirmed: {exc}", file=sys.stderr, flush=True)
        raise


def main(argv=None):
    args = parser().parse_args(argv)
    signals = (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)

    def cancel(_signum, _frame):
        for sig in signals:
            signal.signal(sig, signal.SIG_IGN)
        raise KeyboardInterrupt

    previous = {sig: signal.signal(sig, cancel) for sig in signals}
    try:
        result = run(args, Client(args.url, token=read_token(args.token_file)))
        print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
        return 0 if result.get("ok", True) else 2
    except KeyboardInterrupt:
        print("Cancelled.", file=sys.stderr)
        return 130
    except HTTPError as exc:
        with exc:
            try:
                detail = msgpack.unpackb(exc.read(65536), raw=False)
            except (ValueError, msgpack.UnpackException):
                detail = str(exc)
        print(detail, file=sys.stderr)
        return 1
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    raise SystemExit(main())
