"""Shared token-file parsing for the standalone Go2 server and operator CLI."""

from pathlib import Path


def read_token(path):
    if path is None:
        return None
    token_file = Path(path).expanduser()
    if token_file.stat().st_mode & 0o077:
        raise ValueError("Token file must be private; run chmod 600 on it")
    try:
        token = token_file.read_text(encoding="ascii").strip()
    except UnicodeError as exc:
        raise ValueError("Token file must contain an ASCII bearer token") from exc
    if len(token) < 32 or any(not 33 <= ord(char) <= 126 for char in token):
        raise ValueError("Token must contain at least 32 printable ASCII characters without whitespace")
    return token
