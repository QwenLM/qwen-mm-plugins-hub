#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
exec "$script_dir/.venv/bin/python" "$script_dir/mhs_move.py" "$@"
