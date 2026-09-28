# Go2 MHS adapter

Run an MHS adapter on a Unitree Go2 onboard computer, then use the same six MHS
tools as the mock camera example. The adapter reads the front camera and DDS
state through the official Unitree Python SDK. It starts in read-only mode.

This directory is a standalone case: copy it to the robot without installing the
MCP host there. The host runs separately on the computer running your agent.

## Get the case

```bash
git clone --filter=blob:none --sparse https://github.com/QwenLM/qwen-mm-plugins-hub.git
cd qwen-mm-plugins-hub
git sparse-checkout set public/cases/mhs/go2-adapter
cd public/cases/mhs/go2-adapter/assert
```

## Install on the onboard computer

Use Python 3.12 and a network interface with access to the robot's DDS traffic.
The SDK revision and Python dependencies are pinned in [pyproject.toml](pyproject.toml).
Install the native CycloneDDS library following the
[Unitree SDK instructions](https://github.com/unitreerobotics/unitree_sdk2_python/tree/65691c8a8bc53b98d3976dba4dbf9d5d20b2e7f5)
before installing the Python dependencies. Set both library variables to your
installation, then create the environment:

```bash
export CYCLONEDDS_HOME=/path/to/cyclonedds/install
export LD_LIBRARY_PATH="$CYCLONEDDS_HOME/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
uv sync
.venv/bin/python adapter.py --interface eth0 --port 8803
```

Replace `eth0` with the interface connected to the robot. Startup subscribes to
state and initializes SDK clients; it does not send a movement command.

## Connect the host

The adapter defaults to `127.0.0.1`. Open a tunnel from the agent's computer,
substituting your SSH account and robot hostname:

```bash
ssh -N -L 18803:127.0.0.1:8803 user@robot-host
```

Add this entry to the host's `~/.qwen-mm-plugins/mhs-devices.json` adapter list:

```json
{"name": "go2", "url": "http://127.0.0.1:18803", "timeout": 30}
```

The outer registry object is `{"adapters": [...]}`. Keep existing entries when
adding Go2. Run the read-only protocol check in the host's MHS Python environment:

```bash
python -m qwen_mm_plugins_mhs.verify http://127.0.0.1:18803 --timeout 30
```

Ask the agent to discover the device and read `frame` from `go2/go2`. A frame
contains JPEG bytes plus source dimensions, returned dimensions and receipt time.
The long edge is capped at 640 pixels, with aspect ratio preserved and no upscaling.
An original 1920 × 1080 sample becomes 640 × 360. Camera reads do not send motion
commands or depend on the robot's motion health checks.

`state`, `posture`, `move`, `stop` and `avoidance` can also be read. In read-only
mode, writes are refused and reset returns HTTP 405.

### Direct LAN access

For a non-loopback listener, supply a private token file with at least 32 printable
ASCII characters, no whitespace, and mode `600`. Generate one locally:

```bash
umask 077
.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(32))' > go2-mhs.token
.venv/bin/python adapter.py --interface eth0 --bind 0.0.0.0 --port 8803 --token-file go2-mhs.token
```

Keep that file outside version control. On the host, store the matching token in
`GO2_MHS_TOKEN` and use your robot's address in the registry:

```json
{
  "name": "go2",
  "url": "http://robot-host:8803",
  "timeout": 30,
  "auth": {"type": "bearer", "token_env": "GO2_MHS_TOKEN"}
}
```

HTTP does not encrypt the token or images; use the SSH route when the network is
not trusted. The protocol checker has no bearer-token option; use the MHS tools
with the authenticated registry for this deployment mode.

## Enable movement deliberately

Only add `--allow-motion` when an operator is present and ready to control the
robot. This enables timed velocity commands and stand/sit posture changes.
The default movement path uses native obstacle avoidance. The diagnostic
`--without-avoidance` option selects direct `SportClient.Move` and verifies that
native avoidance is disabled before moving; it is not a navigation mode.

| Parameter | Unit | Range |
|---|---|---|
| `vx` | forward m/s | -0.9 to 0.9 |
| `vy` | left m/s | -0.9 to 0.9 |
| `vyaw` | counterclockwise rad/s | -1.0 to 1.0 |
| `duration_s` | seconds | 0.5 to 5 |

The adapter checks fresh state, battery, tilt and controller readiness, then
stops at the time bound and reports measured displacement and settling. A command
acknowledgement does not guarantee a particular distance or direction. State
decoding is firmware-specific; verify it on your robot before enabling movement.

`stop` cancels velocity motion and waits for measured settling. `reset` with
`mode="estop"` latches further motion and requests vendor damping; damping can
lower the body under gravity. Keep the physical remote available.

The included operator CLI talks to the existing adapter without starting a
second SDK controller:

```bash
./mhs_move.sh status
./mhs_move.sh move --vx 0.2 --duration 1
./mhs_move.sh stop
```

`move` executes immediately and requires a motion-enabled adapter. Nonzero motion
is never retried automatically. On timeout or interruption the CLI attempts a
separate stop; a network failure may prevent that stop from reaching the adapter.

## Code layout

| File | Responsibility |
|---|---|
| [adapter.py](adapter.py) | CLI, startup and shutdown |
| [adapter_server.py](adapter_server.py) | Shared HTTP, MessagePack, authentication and routing |
| [device.py](device.py) | Go2 capabilities and operation lifecycle |
| [sdk.py](sdk.py) | Unitree SDK clients, DDS state and camera access |
| [camera.py](camera.py) | Decode, resize and encode camera frames |
| [state.py](state.py) | Controller state decoding and completion checks |
| [motion.py](motion.py) | Timed motion, cancellation and measured stop |
| [network.py](network.py) | Token-file validation |
| [mhs_move.py](mhs_move.py) | Operator CLI over the running adapter |

`adapter_server.py` is copied unchanged from the
[MHS v1.0.0 reference server](https://github.com/QwenLM/Qwen-MM-Plugins/blob/qwen-mm-plugins-mhs-v1.0.0/src/capabilities/mhs/skill/references/adapter_server.py).
Keep it identical when updating the protocol; Go2-specific behavior belongs in the
other modules. Host, adapter and CLI all use HTTP + MessagePack with raw image
bytes. Update both ends together.

## Offline tests

These tests use a fake SDK, generated images and localhost HTTP. They do not need
CycloneDDS, the Unitree SDK or a connected robot:

```bash
uv run --no-project --python 3.12 --with pytest --with 'msgpack>=1.1,<2' \
  --with 'numpy==2.2.6' --with 'opencv-python==4.11.0.86' python -m pytest -q .
uvx ruff check .
uvx ruff format --check .
bash -n mhs_move.sh
```

Passing the offline suite validates software behavior; it does not validate a
particular robot, firmware, network or physical stopping distance. This publication
does not include a new Jetson hardware validation run.
