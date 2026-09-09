"""Reproducible content estimates using the pinned official Qwen3.5 tokenizer.

No model weights, remote Python code, credentials, or inference requests are used.
Counts exclude prompt/chat wrappers and are not provider usage or billing totals.
"""

from __future__ import annotations

from hashlib import sha256
from importlib.metadata import version
import json
from pathlib import Path
from typing import Callable
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def serialized_definition(tool: dict) -> str:
    """The exact formatted MCP JSON offered by the site's Copy definition button."""
    return json.dumps(
        {key: tool[key] for key in ("name", "description", "inputSchema")},
        ensure_ascii=False,
        indent=2,
        allow_nan=False,
    )


def validate_tokenizer(content: bytes, expected_sha256: str) -> None:
    if sha256(content).hexdigest() != expected_sha256:
        raise ValueError("Tokenizer checksum mismatch; refusing to estimate tokens")


def load_tokenizer(*, offline: bool = False):
    from tokenizers import Tokenizer

    config = json.loads((ROOT / "tokenizer.config.json").read_text())
    if version("tokenizers") != config["engineVersion"]:
        raise ValueError("Install the pinned scripts/requirements-export.txt first")
    url = f"https://huggingface.co/{config['modelId']}/resolve/{config['revision']}/tokenizer.json"
    cache = ROOT / ".sources" / "tokenizers" / f"{config['sha256']}.json"
    if cache.exists():
        content = cache.read_bytes()
    else:
        if offline:
            raise FileNotFoundError(
                "Run the catalog exporter once to cache the tokenizer"
            )
        with urlopen(url, timeout=45) as response:
            content = response.read(32_000_001)
        validate_tokenizer(content, config["sha256"])
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(content)
    validate_tokenizer(content, config["sha256"])
    tokenizer = Tokenizer.from_str(content.decode("utf-8"))
    tokenizer.no_truncation()
    tokenizer.no_padding()
    metadata = {
        **config,
        "sourceUrl": url.replace("/resolve/", "/blob/"),
        "method": "mcp-json-pretty-v1",
        "addSpecialTokens": False,
    }
    return tokenizer, metadata


def estimate_plugin(plugin: dict, count: Callable[[str], int]) -> None:
    for tool in plugin["tools"]:
        tool["definitionText"] = serialized_definition(tool)
        tool["tokenCount"] = count(tool["definitionText"])
    metadata_text = json.dumps(
        {key: plugin["skill"][key] for key in ("name", "description")},
        ensure_ascii=False,
        indent=2,
    )
    plugin["tokenEstimate"] = {
        "skillFull": count(plugin["skill"]["raw"]),
        "skillMetadata": count(metadata_text),
        "toolsTotal": sum(tool["tokenCount"] for tool in plugin["tools"]),
    }


def annotate_catalog(catalog: dict) -> dict:
    tokenizer, metadata = load_tokenizer()

    def count(text: str) -> int:
        return len(tokenizer.encode(text, add_special_tokens=False).ids)

    for plugin in catalog["plugins"]:
        estimate_plugin(plugin, count)
    catalog["tokenizer"] = metadata
    return catalog
