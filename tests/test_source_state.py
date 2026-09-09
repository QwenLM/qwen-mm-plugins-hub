from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from scripts.check_upstream import deployment_needed, read_json
from scripts.source_state import (
    git,
    missing_release_tags,
    parse_refs,
    tag_digest,
    validate_source,
)


class SourceStateTests(unittest.TestCase):
    def test_tag_identity_ignores_branch_lines_and_peeled_duplicates(self):
        sha = "a" * 40
        base = {"refs/tags/qwen-mm-plugins-core-v1.1.0": sha}
        other = {
            **base,
            "refs/heads/main": "b" * 40,
            "refs/tags/qwen-mm-plugins-core-v1.1.0^{}": "c" * 40,
        }
        self.assertEqual(tag_digest(base), tag_digest(other))
        self.assertNotEqual(tag_digest({}), tag_digest(base))
        self.assertEqual(
            parse_refs(f"{sha}\trefs/heads/main\n"), {"refs/heads/main": sha}
        )
        with self.assertRaises(ValueError):
            parse_refs("bad refs/heads/main")

    def test_tags_are_checked_per_capability(self):
        catalog = {
            "plugins": {"core": "1.1.0", "api": "1.1.0"},
            "tag_format": "qwen-mm-plugins-{cap}-v{version}",
        }
        refs = {"refs/tags/qwen-mm-plugins-core-v1.1.0": "a" * 40}
        self.assertEqual(
            missing_release_tags(catalog, refs), ["qwen-mm-plugins-api-v1.1.0"]
        )

    def test_no_change_skips_and_failed_or_missing_deployment_retries(self):
        current = {"sourceCommit": "a", "hubCommit": "b", "tagDigest": "c"}
        self.assertFalse(deployment_needed(current, current, []))
        self.assertTrue(deployment_needed(current, None, []))
        self.assertTrue(
            deployment_needed(current, {**current, "sourceCommit": "old"}, [])
        )
        self.assertTrue(deployment_needed(current, {**current, "tagDigest": "old"}, []))
        self.assertTrue(deployment_needed(current, current, [], True))
        self.assertFalse(deployment_needed(current, None, ["pending-tag"], True))

    def test_only_missing_deployment_metadata_is_treated_as_first_publish(self):
        missing = HTTPError("url", 404, "missing", {}, None)
        failed = HTTPError("url", 500, "failed", {}, None)
        self.addCleanup(missing.close)
        self.addCleanup(failed.close)
        with patch(
            "scripts.check_upstream.urlopen",
            side_effect=missing,
        ):
            self.assertIsNone(
                read_json("https://example.test/build-info.json", missing_ok=True)
            )
        with patch(
            "scripts.check_upstream.urlopen",
            side_effect=failed,
        ):
            with self.assertRaises(HTTPError):
                read_json("https://example.test/build-info.json", missing_ok=True)


class SourceValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q", "-b", "main", str(self.root)], check=True)
        (self.root / "source.txt").write_text("committed source\n")
        git(self.root, "add", ".")
        git(
            self.root,
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "-qm",
            "fixture",
        )
        self.sha = git(self.root, "rev-parse", "HEAD")

    def test_clean_selected_branch_or_explicit_commit_is_accepted(self):
        validate_source(self.root, "main")
        validate_source(self.root, "pull/7/head", self.sha)
        with self.assertRaisesRegex(ValueError, "expected commit"):
            validate_source(self.root, "main", "0" * 40)
        with self.assertRaisesRegex(ValueError, "selected branch"):
            validate_source(self.root, "unknown")

    def test_tracked_or_untracked_edits_cannot_leak_into_export(self):
        (self.root / "untracked.md").write_text("draft")
        with self.assertRaisesRegex(ValueError, "must be clean"):
            validate_source(self.root, "main", self.sha)
        (self.root / "untracked.md").unlink()
        (self.root / "source.txt").write_text("dirty")
        with self.assertRaisesRegex(ValueError, "must be clean"):
            validate_source(self.root, "main")


if __name__ == "__main__":
    unittest.main()
