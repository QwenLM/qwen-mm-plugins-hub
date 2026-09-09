"""Offline contract and regression tests; export once to populate the tokenizer cache."""

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from scripts.token_estimates import (
    estimate_plugin,
    load_tokenizer,
    serialized_definition,
    validate_tokenizer,
)

ROOT = Path(__file__).resolve().parents[1]


class CountingContractTests(unittest.TestCase):
    def test_full_skill_and_exact_allowlisted_tool_definitions(self):
        tool = {
            "name": "测试",
            "description": "Read 🧩",
            "inputSchema": {"type": "object", "properties": {}},
            "sourceUrl": "https://example.com/not-context",
            "tokenCount": 999,
        }
        raw = "---\nname: test\ndescription: 测试\n---\n\n" + "line\n" * 80
        plugin = {
            "skill": {"raw": raw, "name": "test", "description": "测试"},
            "tools": [deepcopy(tool), deepcopy(tool)],
        }
        estimate_plugin(plugin, len)
        definition = serialized_definition(tool)
        self.assertEqual(plugin["tokenEstimate"]["skillFull"], len(raw))
        self.assertEqual(plugin["tokenEstimate"]["toolsTotal"], 2 * len(definition))
        self.assertEqual(
            plugin["tokenEstimate"]["skillMetadata"],
            len(
                json.dumps(
                    {"name": "test", "description": "测试"},
                    ensure_ascii=False,
                    indent=2,
                )
            ),
        )
        self.assertEqual(
            set(json.loads(definition)), {"name", "description", "inputSchema"}
        )
        self.assertNotIn("\\u6d4b", definition)
        self.assertEqual(plugin["tools"][0]["definitionText"], definition)

    def test_skill_only_has_zero_tool_tokens(self):
        plugin = {
            "skill": {"raw": "Skill", "name": "test", "description": ""},
            "tools": [],
        }
        estimate_plugin(plugin, len)
        self.assertEqual(plugin["tokenEstimate"]["toolsTotal"], 0)

    def test_checksum_rejects_modified_bytes(self):
        content = b"known tokenizer bytes"
        checksum = sha256(content).hexdigest()
        validate_tokenizer(content, checksum)
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            validate_tokenizer(content + b"modified", checksum)


class PinnedTokenizerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch(
            "scripts.token_estimates.urlopen",
            side_effect=AssertionError("Offline tests must not fetch"),
        ):
            cls.tokenizer, cls.metadata = load_tokenizer(offline=True)

    def count(self, text):
        return len(self.tokenizer.encode(text, add_special_tokens=False).ids)

    def test_multilingual_golden_ids(self):
        fixtures = {
            "": [],
            "Hello, world!": [9419, 11, 1814, 0],
            "你好，世界！": [109266, 3709, 96748, 6115],
            "def read_image(path: str):\n    return path\n": [
                727,
                1301,
                4794,
                5406,
                25,
                592,
                1590,
                198,
                262,
                460,
                1752,
                198,
            ],
            "🧩 Skills / 工具": [9008, 100, 102, 29254, 593, 220, 99445],
        }
        for text, expected in fixtures.items():
            with self.subTest(text=text):
                self.assertEqual(
                    self.tokenizer.encode(text, add_special_tokens=False).ids, expected
                )

    def test_no_padding_truncation_or_added_special_tokens(self):
        self.assertIsNone(self.tokenizer.padding)
        self.assertIsNone(self.tokenizer.truncation)
        self.assertEqual(self.count(""), 0)
        self.assertGreater(self.count("token " * 20000), 19000)

    def test_every_exported_count_is_reproducible(self):
        catalog = json.loads((ROOT / "data/catalog.json").read_text())
        self.assertEqual(catalog["tokenizer"], self.metadata)
        for plugin in catalog["plugins"]:
            with self.subTest(plugin=plugin["id"]):
                recomputed = deepcopy(plugin)
                estimate_plugin(recomputed, self.count)
                self.assertEqual(recomputed["tokenEstimate"], plugin["tokenEstimate"])
                for actual, expected in zip(
                    recomputed["tools"], plugin["tools"], strict=True
                ):
                    self.assertEqual(
                        actual["definitionText"], expected["definitionText"]
                    )
                    self.assertEqual(actual["tokenCount"], expected["tokenCount"])


if __name__ == "__main__":
    unittest.main()
