"""Check public upstream refs without importing or executing upstream code."""

import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .source_state import (
    ROOT,
    build_identity,
    git,
    missing_release_tags,
    parse_refs,
    read_config,
)


def read_json(url: str, *, missing_ok: bool = False) -> dict | None:
    request = Request(
        url, headers={"Cache-Control": "no-cache", "User-Agent": "qwen-mm-plugins-hub"}
    )
    try:
        with urlopen(request, timeout=20) as response:
            content = response.read(1_000_001)
    except HTTPError as error:
        if missing_ok and error.code == 404:
            error.close()
            return None
        raise
    if len(content) > 1_000_000:
        raise ValueError("Unexpectedly large upstream metadata")
    return json.loads(content)


def deployment_needed(
    expected: dict, published: dict | None, missing: list[str], force: bool = False
) -> bool:
    # Version bumps reach main before their immutable tags. Never publish broken install refs.
    return not missing and (force or expected != published)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--published-url", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    config = read_config()
    repository = config["repository"]
    refs = parse_refs(
        git(
            ROOT,
            "ls-remote",
            "--refs",
            f"https://github.com/{repository}.git",
            "refs/heads/" + config["ref"],
            "refs/tags/qwen-mm-plugins-*",
        )
    )
    sha = refs["refs/heads/" + config["ref"]]
    expected = build_identity(git(ROOT, "rev-parse", "HEAD"), sha, config["ref"], refs)
    catalog = read_json(
        f"https://raw.githubusercontent.com/{repository}/{sha}/plugin-versions.json"
    )
    missing = missing_release_tags(catalog, refs)
    published = read_json(
        args.published_url.rstrip("/") + "/build-info.json", missing_ok=True
    )
    needed = deployment_needed(expected, published, missing, args.force)
    outputs = {
        "changed": str(needed).lower(),
        "source_sha": sha,
        "source_ref": config["ref"],
        "source_repository": repository,
    }
    if path := os.environ.get("GITHUB_OUTPUT"):
        with Path(path).open("a") as file:
            file.write("".join(f"{key}={value}\n" for key, value in outputs.items()))
    if missing:
        print("Waiting for release tags: " + ", ".join(missing))
    else:
        print(
            "Content changed; build required."
            if needed
            else "Published content is current; nothing to deploy."
        )


if __name__ == "__main__":
    main()
