from __future__ import annotations
import io,json,os,sys,tempfile,unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock
REPO=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(REPO/".claude/skills/ai-pm-setup/scripts")); import aipm_setup
class CliTests(unittest.TestCase):
    def setUp(self):
        self.tmp=Path(tempfile.mkdtemp()); self.ps=[mock.patch.object(aipm_setup,"STATE_PATH",self.tmp/"s.json"),mock.patch.object(aipm_setup,"LOCK_PATH",self.tmp/"s.lock"),mock.patch.object(aipm_setup,"MCP_PATH",self.tmp/".mcp.json")]
        for p in self.ps:p.start()
    def tearDown(self):
        for p in self.ps:p.stop()
    def call(self,*a):
        b=io.StringIO()
        with redirect_stdout(b): c=aipm_setup.main(list(a))
        return c,b.getvalue()
    def test_parse_and_pending(self):
        self.assertEqual(aipm_setup.parse_mcp_list("playwright: x - ✓ Connected"),{"playwright":"connected"}); self.assertEqual(self.call("pending-hint"),(0,""))
    def test_register_and_invalid(self):
        self.assertEqual(self.call("register","--target","android","--key","ready","--value","1","--json")[0],2)
        self.assertEqual(self.call("register","--target","android","--key","pending_recheck","--value","true")[0],0); self.assertIn("android",self.call("pending-hint")[1])
    def test_invalid_mcp(self):
        (self.tmp/".mcp.json").write_text("{bad")
        c,o=self.call("status","--target","web","--quick","--json"); self.assertEqual(c,2); self.assertEqual(json.loads(o)[0]["code"],"MCP_CONFIG_INVALID")
