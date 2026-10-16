from __future__ import annotations
import json, sys, tempfile, unittest
from pathlib import Path
REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / ".claude/skills/ai-pm-setup/scripts")); sys.path.insert(0, str(REPO / "scripts"))
import setup_common, setup_mcp, aipm_package
CONF = setup_common.load_config()
class McpTests(unittest.TestCase):
    def setUp(self): self.path = Path(tempfile.mkdtemp()) / ".mcp.json"
    def pw(self, browser="chrome"):
        return setup_mcp.render_entry(CONF["servers"]["playwright"], setup_mcp.base_ctx(CONF, "playwright", browser=browser, tools="/t"))
    def test_matches_packager_shape(self):
        packed = json.loads(aipm_package.private_mcp_json())["mcpServers"]["playwright"]
        self.assertEqual(packed["args"], ["-y", "@playwright/mcp@0.0.83", "--browser", "chrome"])
        self.assertEqual(self.pw()["args"], ["-y", "@playwright/mcp@0.0.83", "--browser", "chrome"])
    def test_optional_env_and_missing(self):
        e = setup_mcp.render_entry(CONF["servers"]["mobile-mcp"], setup_mcp.base_ctx(CONF, "mobile-mcp", tools="/t", android_home=None))
        self.assertNotIn("ANDROID_HOME", e["env"]); self.assertTrue(e["args"][0].startswith("/t/npm/"))
        with self.assertRaises(KeyError): setup_mcp.render_entry(CONF["servers"]["windows-mcp"], setup_mcp.base_ctx(CONF, "windows-mcp"))
    def test_bom_bad_json_backup_and_conflict(self):
        self.assertEqual(setup_mcp.read_mcp(self.path), {"mcpServers": {}})
        self.path.write_text('\ufeff{"mcpServers":{"x":{"command":"a"}}}', encoding="utf-8")
        self.assertIn("x", setup_mcp.read_mcp(self.path)["mcpServers"])
        self.path.write_text("{bad", encoding="utf-8")
        with self.assertRaises(setup_mcp.McpConfigError): setup_mcp.apply_entry(self.path, "playwright", self.pw(), set())
        self.path.write_text(json.dumps({"mcpServers":{"playwright":{"command":"x","args":[]}}}), encoding="utf-8")
        self.assertEqual(setup_mcp.apply_entry(self.path, "playwright", self.pw(), set()), "conflict")
    def test_add_update_remove_ownership(self):
        self.path.write_text(json.dumps({"mcpServers":{"mine":{"command":"x"}}}), encoding="utf-8")
        self.assertEqual(setup_mcp.apply_entry(self.path, "playwright", self.pw(), set()), "added")
        self.assertTrue((self.path.parent / ".mcp.json.bak").exists())
        self.assertEqual(setup_mcp.remove_entry(self.path, "mine", set()), "conflict")
        self.assertEqual(setup_mcp.remove_entry(self.path, "playwright", {setup_mcp.entry_digest(self.pw())}), "removed")
