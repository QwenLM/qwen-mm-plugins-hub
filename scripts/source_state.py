"""Small, dependency-free source/deployment identities shared by export and CI."""

from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def git(source: Path, *args: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(source), *args], text=True, timeout=45
    ).strip()


def read_config() -> dict:
    config = json.loads((ROOT / "source.config.json").read_text())
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", config["repository"]):
        raise ValueError("Source repository must be a GitHub owner/repository")
    subprocess.run(
        ["git", "check-ref-format", "refs/heads/" + config["ref"]], check=True
    )
    return config


def parse_refs(text: str) -> dict[str, str]:
    refs = {}
    for line in text.splitlines():
        sha, ref = line.split()
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise ValueError("Invalid Git object ID")
        refs[ref] = sha
    return refs


def tag_digest(refs: dict[str, str]) -> str:
    text = "\n".join(
        f"{refs[ref]}\t{ref}"
        for ref in sorted(refs)
        if ref.startswith("refs/tags/qwen-mm-plugins-") and not ref.endswith("^{}")
    )
    return sha256(text.encode()).hexdigest()


def local_tag_refs(source: Path) -> dict[str, str]:
    return parse_refs(
        git(source, "for-each-ref", "--format=%(objectname)\t%(refname)", "refs/tags/")
    )


def build_identity(
    hub_sha: str, source_sha: str, ref: str, tags: dict[str, str]
) -> dict:
    return {
        "schema": 1,
        "hubCommit": hub_sha,
        "sourceRepository": read_config()["repository"],
        "sourceRef": ref,
        "sourceCommit": source_sha,
        "tagDigest": tag_digest(tags),
    }


def missing_release_tags(catalog: dict, refs: dict[str, str]) -> list[str]:
    return [
        tag
        for cap, version in catalog["plugins"].items()
        if "refs/tags/"
        + (tag := catalog["tag_format"].format(cap=cap, version=version))
        not in refs
    ]


def validate_source(source: Path, ref: str, expected_commit: str | None = None) -> None:
    if git(source, "status", "--porcelain", "--untracked-files=normal"):
        raise ValueError(
            "Commit source changes first; the plugin checkout must be clean"
        )
    head = git(source, "rev-parse", "HEAD")
    if expected_commit is not None:
        if (
            not re.fullmatch(r"[0-9a-f]{40}", expected_commit)
            or head != expected_commit
        ):
            raise ValueError("Source HEAD does not match the expected commit")
        return
    for candidate in (f"refs/heads/{ref}", f"refs/remotes/origin/{ref}"):
        result = subprocess.run(
            ["git", "-C", str(source), "rev-parse", "--verify", candidate],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip() == head:
            return
    raise ValueError(f"Source checkout must match the selected branch: {ref}")
