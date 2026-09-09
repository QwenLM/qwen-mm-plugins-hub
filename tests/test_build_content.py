"""A new plugin needs only its source files and a Hub cookbook, not registration tables."""

import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from scripts.build_content import (
    build_content,
    build_docs,
    check_cases,
    contributor_metadata,
    read_markdown,
)


class ContentBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "plugins"
        self.source.mkdir()
        self.books = self.root / "cookbooks"
        self.books.mkdir()

    def write(self, path, text):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def plugin(self, cap):
        folder = self.source / "src/capabilities" / cap
        self.write(
            folder / ".codex-plugin/plugin.json",
            json.dumps(
                {
                    "name": "qwen-mm-plugins-" + cap,
                    "version": "1.0.0",
                    "description": "A newly added capability.",
                    "skills": "./skill",
                }
            ),
        )
        self.write(
            folder / "skill/SKILL.md",
            f"---\nname: {cap}\ndescription: New Skill.\n---\n\n# A new Skill\n",
        )

    def commit(self, caps):
        self.write(
            self.source / "plugin-versions.json",
            json.dumps(
                {
                    "plugins": {cap: "1.0.0" for cap in caps},
                    "tag_format": "qwen-mm-plugins-{cap}-v{version}",
                }
            ),
        )
        for args in [
            ("init", "-q"),
            ("add", "."),
            (
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.com",
                "commit",
                "-qm",
                "fixture",
            ),
        ]:
            subprocess.run(
                ["git", "-C", str(self.source), *args], check=True, capture_output=True
            )

    def test_new_plugin_is_discovered_with_only_source_and_cookbook(self):
        self.plugin("new-plugin")
        self.commit(["new-plugin"])
        self.write(
            self.books / "new-plugin/usage.md",
            "# New cookbook\n\nA case walkthrough.\n",
        )
        catalog, books = build_content(self.source, self.books)
        plugin = catalog["plugins"][0]
        self.assertEqual(plugin["id"], "new-plugin")
        self.assertEqual(plugin["contributors"], ["qwenlm"])
        self.assertEqual(
            catalog["contributors"]["qwenlm"],
            {
                "name": "QwenLM",
                "url": "https://github.com/QwenLM",
                "avatarUrl": "https://github.com/QwenLM.png?size=80",
            },
        )
        self.assertNotIn("icon", plugin)
        self.assertNotIn("color", plugin)
        self.assertEqual(plugin["title"], "New Plugin")
        self.assertEqual(plugin["tools"], [])
        self.assertEqual(
            books["new-plugin"]["markdown"], "# New cookbook\n\nA case walkthrough.\n"
        )

    def test_docs_are_discovered_from_the_same_committed_snapshot(self):
        markdown = "# Installation\n\n```bash\ncurl https://example.test/install.sh | bash\n```\n"
        self.write(self.source / "docs/en/installation.md", markdown)
        self.write(
            self.source / "docs/en/new_guide.md",
            "# New guide\n\n[Install](installation.md#install)\n",
        )
        self.write(self.source / "docs/zh/installation.md", "# 中文\n")
        self.plugin("new-plugin")
        self.commit(["new-plugin"])
        self.write(self.books / "new-plugin/usage.md", "# Cookbook\n")
        self.write(self.source / "docs/en/installation.md", "# Uncommitted edit\n")
        self.write(self.source / "docs/en/untracked.md", "# Not committed\n")
        docs = build_docs(self.source)
        catalog, _ = build_content(self.source, self.books)
        self.assertEqual(docs["commit"], catalog["plugins"][0]["source"]["commit"])
        self.assertEqual(docs["ref"], catalog["plugins"][0]["channel"])
        self.assertEqual(
            [page["slug"] for page in docs["pages"]], ["installation", "new-guide"]
        )
        self.assertEqual(docs["pages"][0]["markdown"], markdown)
        self.assertEqual(
            docs["pages"][0]["sourceUrl"],
            f"{docs['repository']}/blob/{docs['commit']}/docs/en/installation.md",
        )
        self.assertEqual(docs["pages"][1]["title"], "New guide")

    def test_branch_previews_do_not_advertise_prepared_release_tags(self):
        self.plugin("new-plugin")
        self.commit(["new-plugin"])
        self.write(self.books / "new-plugin/usage.md", "# Cookbook\n")
        for ref in ("main", "support_hub"):
            with self.subTest(ref=ref):
                catalog, _ = build_content(self.source, self.books, source_ref=ref)
                plugin = catalog["plugins"][0]
                self.assertEqual(plugin["channel"], ref)
                if ref == "main":
                    self.assertEqual(
                        plugin["release"]["tag"], "qwen-mm-plugins-new-plugin-v1.0.0"
                    )
                else:
                    self.assertIsNone(plugin["release"])

    def test_docs_fail_on_missing_entry_or_duplicate_routes(self):
        self.write(self.source / "docs/en/new_guide.md", "# New guide\n")
        self.commit([])
        with self.assertRaisesRegex(ValueError, "Missing documentation entry"):
            build_docs(self.source)
        self.write(self.source / "docs/en/installation.md", "# Installation\n")
        self.write(self.source / "docs/en/new-guide.md", "# Duplicate\n")
        self.commit([])
        with self.assertRaisesRegex(ValueError, "Duplicate documentation slug"):
            build_docs(self.source)

    def test_docs_require_a_title(self):
        self.write(self.source / "docs/en/installation.md", "Missing H1\n")
        self.commit([])
        with self.assertRaisesRegex(ValueError, "H1 title"):
            build_docs(self.source)

    def test_cookbook_metadata_supplies_new_categories_tags_and_contributors(self):
        self.plugin("new-plugin")
        self.commit(["new-plugin"])
        self.write(
            self.books / "new-plugin/usage.md",
            """---
title: My plugin
category: A new category
tags: [Demo, local, ' demo ']
contributors: [New-Team, new-team, Another]
---

# Cookbook
""",
        )
        catalog, books = build_content(self.source, self.books)
        self.assertEqual(catalog["categories"], ["A new category"])
        self.assertEqual(catalog["plugins"][0]["tags"], ["demo", "local"])
        self.assertEqual(catalog["plugins"][0]["contributors"], ["new-team", "another"])
        self.assertEqual(catalog["contributors"]["new-team"]["name"], "New-Team")
        self.assertEqual(
            catalog["contributors"]["another"]["avatarUrl"],
            "https://github.com/Another.png?size=80",
        )
        self.assertEqual(books["new-plugin"]["markdown"], "# Cookbook\n")

    def test_invalid_contributors_name_the_cookbook(self):
        for handles in (
            [],
            "QwenLM",
            [""],
            ["bad/name"],
            ["-invalid"],
            ["a--b"],
            [123],
            ["a" * 40],
        ):
            with self.subTest(handles=handles):
                with self.assertRaisesRegex(ValueError, "new-plugin/usage.md"):
                    contributor_metadata(handles, Path("new-plugin/usage.md"))

    def test_invalid_tags_name_the_cookbook(self):
        self.plugin("new-plugin")
        self.commit(["new-plugin"])
        for tags in ("video", "[video, 123]", '[""]'):
            with self.subTest(tags=tags):
                self.write(
                    self.books / "new-plugin/usage.md",
                    f"---\ntags: {tags}\n---\n# Cookbook\n",
                )
                with self.assertRaisesRegex(ValueError, "new-plugin/usage.md"):
                    build_content(self.source, self.books)

    def test_missing_cookbook_names_the_file_to_add(self):
        self.plugin("new-plugin")
        self.commit(["new-plugin"])
        with self.assertRaisesRegex(ValueError, "new-plugin/usage.md"):
            build_content(self.source, self.books)

    def test_new_case_files_need_no_inventory_update(self):
        cases = self.root / "cases"
        self.write(cases / "new-plugin/demo/assert/result.txt", "New output")
        check_cases(cases)
        self.write(cases / "new-plugin/demo/assert/another.txt", "More output")
        check_cases(cases)
        self.write(cases / "misplaced.txt", "Wrong folder")
        with self.assertRaisesRegex(ValueError, "assert"):
            check_cases(cases)

    def test_markdown_front_matter_is_optional(self):
        file = self.root / "book.md"
        file.write_text("# Cookbook\n")
        self.assertEqual(read_markdown(file), ({}, "# Cookbook\n"))

    def test_yaml_block_strings_keep_their_source_newline(self):
        file = self.root / "skill.md"
        file.write_text(
            "---\ndescription: |\n  First line.\n  Second line.\n---\n\n# Skill\n"
        )
        metadata, _ = read_markdown(file)
        self.assertEqual(metadata["description"], "First line.\nSecond line.\n")


if __name__ == "__main__":
    unittest.main()
