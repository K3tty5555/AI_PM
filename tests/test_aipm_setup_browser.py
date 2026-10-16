from __future__ import annotations
import socket, sys, unittest
from pathlib import Path
REPO=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(REPO/".claude/skills/ai-pm-setup/scripts")); import setup_browser as sb
class BrowserTests(unittest.TestCase):
    def test_windows_order_and_none(self):
        env={"ProgramFiles":"C:\\Program Files","ProgramFiles(x86)":"C:\\Program Files (x86)","LOCALAPPDATA":"C:\\Users\\u\\AppData\\Local"}; edge="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
        self.assertEqual(sb.find_browser("windows",env,lambda n:None,lambda p:p==edge)["kind"],"msedge"); self.assertIsNone(sb.find_browser("mac",{},lambda n:None,lambda p:False))
    def test_port_and_launch(self):
        s=socket.socket(); s.bind(("127.0.0.1",0)); p=s.getsockname()[1]; self.assertFalse(sb.port_free(p)); s.close(); self.assertTrue(sb.port_free(p)); seen={}
        sb.launch({"kind":"chrome","path":"/c"},9223,"about:blank","windows",lambda a,**kw:seen.update(args=a,kw=kw)); self.assertIn("--remote-debugging-port=9223",seen["args"]); self.assertIn("creationflags",seen["kw"])
