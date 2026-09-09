"""Build the Hub from one plugin checkout plus local cookbooks and case files.

Each plugin uses a fresh process so registries cannot contaminate each other's imports.
Missing imports and invalid versions fail the build instead of hiding tools.
"""

from __future__ import annotations

import argparse
import importlib
import inspect
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote

import yaml

from .token_estimates import annotate_catalog

ROOT = Path(__file__).resolve().parents[1]
SOURCE_REF = json.loads((ROOT / "source.config.json").read_text())["ref"]
REPOSITORY = "https://github.com/QwenLM/Qwen-MM-Plugins"
HUB_REPOSITORY = "https://github.com/QwenLM/qwen-mm-plugins-hub"
DEFAULT_CONTRIBUTORS = ["QwenLM"]


def contributor_metadata(handles: list[str], path: Path) -> dict:
    """GitHub handles are the only authored identity; profile and avatar follow it."""
    if not isinstance(handles, list) or not handles:
        raise ValueError(
            f"contributors must be a non-empty list of GitHub accounts: {path}"
        )
    people = {}
    for handle in handles:
        if (
            not isinstance(handle, str)
            or not re.fullmatch(
                r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", handle
            )
            or "--" in handle
        ):
            raise ValueError(f"Invalid GitHub contributor {handle!r}: {path}")
        people.setdefault(
            handle.lower(),
            {
                "name": handle,
                "url": f"https://github.com/{handle}",
                "avatarUrl": f"https://github.com/{handle}.png?size=80",
            },
        )
    return people


def read_markdown(path: Path) -> tuple[dict, str]:
    """Optional YAML front matter supplies display metadata; the rest is Markdown."""
    text = path.read_text()
    if not text.startswith("---\n"):
        return {}, text
    front, separator, body = text[4:].partition("\n---\n")
    if not separator:
        raise ValueError(f"Unclosed YAML front matter: {path}")
    metadata = yaml.safe_load(front + "\n") or {}
    if not isinstance(metadata, dict):
        raise ValueError(f"Front matter must be a mapping: {path}")
    return metadata, body.lstrip("\n")


def check_cases(root: Path) -> None:
    """Check actual files, never a second hand-maintained media inventory."""
    for file in root.rglob("*"):
        if file.is_symlink():
            raise ValueError(f"Case assets cannot be symlinks: {file}")
        if file.is_file():
            if file.stat().st_size >= 25 * 1024 * 1024:
                raise ValueError(f"Case file must be below 25 MiB: {file}")
            if not re.fullmatch(
                r"[^/]+/[^/]+/(?:index\.html|assert/.+)",
                file.relative_to(root).as_posix(),
            ):
                raise ValueError(
                    f"Put case media under <plugin>/<case>/assert/: {file}"
                )


def git(source: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(source), *args], text=True).strip()


def worker(source: Path, cap: str) -> dict:
    """Read exactly the definitions advertised by the MCP registry."""
    folder = source / "src" / "capabilities" / cap
    sys.path[:0] = [str(source / "src"), str(folder)]
    manifest = json.loads((folder / ".codex-plugin/plugin.json").read_text())
    skill_path = folder / "skill/SKILL.md"
    raw = skill_path.read_text()
    if not raw.startswith("---\n"):
        raise ValueError(f"Missing Skill front matter: {cap}")
    front, body = read_markdown(skill_path)
    tools, requirements = [], []
    module_doc = ""
    if manifest.get("mcpServers"):
        module = importlib.import_module("qwen_mm_plugins_" + cap.replace("-", "_"))
        if module.__version__ != manifest["version"]:
            raise ValueError(f"Manifest/server version mismatch: {cap}")
        module_doc = inspect.getdoc(module) or ""
        requirements = [
            {key: d[key] for key in ("label", "tools", "hint")}
            for d in getattr(module, "SYSTEM_DEPS", [])
        ]
        for spec in module.SPECS:
            path = Path(inspect.getfile(spec.handle)).resolve()
            tools.append(
                {
                    **spec.meta,
                    "sourcePath": path.relative_to(source).as_posix(),
                    "sourceLine": inspect.getsourcelines(spec.handle)[1],
                }
            )
    markdown = body.strip()
    prerequisite = re.search(
        r"^## Prerequisites?\b[^\n]*\n.*?(?=^## |\Z)", markdown, re.M | re.S
    )
    return {
        "name": manifest["name"],
        "version": manifest["version"],
        "description": manifest["description"],
        "moduleDocstring": module_doc,
        "requirements": requirements,
        "skill": {
            "name": front["name"],
            "description": front.get("description", ""),
            "markdown": markdown,
            "prerequisites": prerequisite.group().strip() if prerequisite else "",
            "raw": raw,
            "path": skill_path.relative_to(source).as_posix(),
        },
        "tools": sorted(tools, key=lambda t: t["name"]),
        "kind": "Skill + MCP" if manifest.get("mcpServers") else "Skill only",
    }


def build_content(
    source: Path,
    cookbook_root: Path = ROOT / "content/cookbooks",
    source_ref: str = SOURCE_REF,
) -> tuple[dict, dict]:
    release_catalog = json.loads((source / "plugin-versions.json").read_text())
    versions = release_catalog["plugins"]
    plugins, cookbooks, all_contributors = [], {}, {}
    sha = git(source, "rev-parse", "HEAD")
    source_url = REPOSITORY + "/blob/" + sha + "/"
    source_date = git(source, "show", "-s", "--format=%cI", "HEAD")
    for cap, release_version in versions.items():
        cookbook_path = cookbook_root / cap / "usage.md"
        if not cookbook_path.is_file():
            raise ValueError(f"Add the new plugin's cookbook: {cookbook_path}")
        info, markdown = read_markdown(cookbook_path)
        cookbooks[cap] = {
            "markdown": markdown,
            "sourceUrl": f"{HUB_REPOSITORY}/blob/main/content/cookbooks/{cap}/usage.md",
        }
        env = {
            k: v
            for k, v in os.environ.items()
            if not k.startswith(
                ("QWEN_", "DASHSCOPE_", "MEM_", "SERPER_", "TAVILY_", "EXA_")
            )
        }
        env["QWEN_MM_CONFIG"] = os.devnull
        result = subprocess.check_output(
            [
                sys.executable,
                "-m",
                "scripts.build_content",
                "--source",
                str(source),
                "--worker",
                cap,
            ],
            text=True,
            env=env,
            cwd=ROOT,
        )
        data = json.loads(result)
        skill_folder = f"src/capabilities/{cap}/skill/"
        skill_files = git(
            source, "ls-tree", "-rz", "--name-only", "HEAD", "--", skill_folder
        ).split("\0")
        release_tag = release_catalog["tag_format"].format(
            cap=cap, version=release_version
        )
        contributors = contributor_metadata(
            info.get("contributors", DEFAULT_CONTRIBUTORS), cookbook_path
        )
        for key, person in contributors.items():
            all_contributors.setdefault(key, person)
        tags = info.get("tags", [])
        if not isinstance(tags, list) or any(
            not isinstance(tag, str) or not tag.strip() for tag in tags
        ):
            raise ValueError(
                f"tags must be a list of non-empty strings: {cookbook_path}"
            )
        plugins.append(
            {
                **data,
                "id": cap,
                "release": {
                    "version": release_version,
                    "tag": release_tag,
                    "url": REPOSITORY + "/tree/" + release_tag,
                }
                if source_ref == "main"
                else None,
                "title": info.get("title", cap.replace("-", " ").title()),
                "category": info.get("category", "Other"),
                "tags": list(dict.fromkeys(tag.strip().lower() for tag in tags)),
                "contributors": list(contributors),
                "order": info.get("order", 99),
                "channel": source_ref,
                "source": {
                    "repository": REPOSITORY,
                    "commit": sha,
                    "date": source_date,
                    "url": source_url,
                    "path": f"src/capabilities/{cap}",
                },
                "skill": {
                    **data["skill"],
                    "sourceUrl": source_url + data["skill"]["path"],
                    "directoryUrl": source_url.replace("/blob/", "/tree/")
                    + skill_folder,
                    "files": [
                        {
                            "path": path.removeprefix(skill_folder),
                            "sourceUrl": source_url + quote(path, safe="/"),
                        }
                        for path in skill_files
                        if path
                    ],
                },
                "tools": [
                    {
                        **tool,
                        "sourceUrl": source_url
                        + tool["sourcePath"]
                        + "#L"
                        + str(tool["sourceLine"]),
                    }
                    for tool in data["tools"]
                ],
                "cookbookUrl": f"/plugins/{cap}/cookbook/",
            }
        )
    plugins.sort(key=lambda p: (p["order"], p["id"]))
    return {
        "repository": REPOSITORY,
        "contributors": all_contributors,
        "categories": list(dict.fromkeys(p["category"] for p in plugins)),
        "plugins": plugins,
    }, cookbooks


def build_docs(source: Path, source_ref: str = SOURCE_REF) -> dict:
    """Publish committed English Markdown without creating a second authored copy."""
    sha = git(source, "rev-parse", "HEAD")
    paths = git(source, "ls-tree", "-rz", "--name-only", sha, "--", "docs/en/")
    pages = []
    for path in paths.split("\0"):
        if not path.endswith(".md"):
            continue
        slug = Path(path).relative_to("docs/en").with_suffix("").as_posix()
        slug = slug.replace("_", "-").replace("/", "-")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise ValueError(f"Unsupported documentation filename: {path}")
        if any(page["slug"] == slug for page in pages):
            raise ValueError(f"Duplicate documentation slug: {slug}")
        markdown = subprocess.check_output(
            ["git", "-C", str(source), "show", f"{sha}:{path}"], text=True
        )
        title = re.search(r"^# (.+)$", markdown, re.M)
        if not title:
            raise ValueError(f"Documentation needs an H1 title: {path}")
        pages.append(
            {
                "slug": slug,
                "path": path,
                "title": title.group(1).strip(),
                "markdown": markdown,
                "sourceUrl": f"{REPOSITORY}/blob/{sha}/{path}",
            }
        )
    if not any(page["slug"] == "installation" for page in pages):
        raise ValueError("Missing documentation entry: docs/en/installation.md")
    return {"repository": REPOSITORY, "ref": source_ref, "commit": sha, "pages": pages}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--worker")
    args = parser.parse_args()
    if args.worker:
        print(json.dumps(worker(args.source.resolve(), args.worker)))
        return
    if git(args.source, "rev-parse", "HEAD") != git(
        args.source, "rev-parse", f"refs/heads/{SOURCE_REF}"
    ):
        raise ValueError(
            f"Source checkout must match the configured branch: {SOURCE_REF}"
        )
    check_cases(ROOT / "public/cases")
    catalog, cookbooks = build_content(args.source.resolve())
    catalog = annotate_catalog(catalog)
    docs = build_docs(args.source.resolve())
    for name, data in (("catalog", catalog), ("cookbooks", cookbooks), ("docs", docs)):
        (ROOT / "data" / f"{name}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        )
    print(
        f"Exported {len(catalog['plugins'])} plugins / {sum(len(p['tools']) for p in catalog['plugins'])} tools / {len(docs['pages'])} docs"
    )


if __name__ == "__main__":
    main()
