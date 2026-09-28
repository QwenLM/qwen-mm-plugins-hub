"""Physical Go2 MHS server entry point; SDK/state/device live in separate modules."""

import argparse
import ipaddress
import signal

from adapter_server import AdapterServer
from device import Go2
from network import read_token
from sdk import SDK


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interface", default="eth0")
    parser.add_argument(
        "--bind", default="127.0.0.1", help="IPv4 listen address; LAN binding requires a token file"
    )
    parser.add_argument("--port", type=int, default=8803)
    parser.add_argument("--token-file", help="Private file containing the bearer token (chmod 600)")
    parser.add_argument("--allow-motion", action="store_true")
    parser.add_argument(
        "--without-avoidance",
        action="store_true",
        help="Use SportClient.Move with native avoidance disabled for controlled diagnostics",
    )
    args = parser.parse_args(argv)
    try:
        address = ipaddress.IPv4Address(args.bind)
        token = read_token(args.token_file)
        if not address.is_loopback and token is None:
            raise ValueError("Non-loopback --bind requires --token-file")
        if not 1 <= args.port <= 65535:
            raise ValueError("--port must be between 1 and 65535")
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    device = Go2(SDK(args.interface), args.allow_motion, use_avoidance=not args.without_avoidance)
    server = AdapterServer((str(address), args.port), [device], token=token)
    print(
        f"MHS physical Go2: {address}:{args.port}; motion={args.allow_motion}; "
        f"move_avoidance={not args.without_avoidance}; auth={token is not None}",
        flush=True,
    )

    def terminate(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, terminate)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if device.busy:
            device.reset({"mode": "estop"})
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
