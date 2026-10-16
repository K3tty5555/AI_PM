from __future__ import annotations
import json, unittest
from pathlib import Path
REPO=Path(__file__).resolve().parents[1]; SKILL=REPO/".claude/skills/ai-pm-setup"
class SetupContractTests(unittest.TestCase):
    def test_registry_and_router(self):
        reg=json.loads((REPO/"templates/configs/capability-registry.json").read_text())
        entry=next(c for c in reg["capabilities"] if c["id"]=="setup")
        self.assertEqual(entry["skill"],"ai-pm-setup"); self.assertIn("setup",reg["workspace_commands"])
        self.assertIn("/ai-pm setup",(REPO/".claude/skills/ai-pm/SKILL.md").read_text())
    def test_skill_safety_and_resources(self):
        text=(SKILL/"SKILL.md").read_text()
        for n in ("装之前先问","以管理员身份运行","测试账号","status --quick","已按官方开关关闭"): self.assertIn(n,text)
        for rel in ("recipes/web.md","recipes/android.md","recipes/windows-app.md","references/windows-acceptance-checklist.md"): self.assertTrue((SKILL/rel).is_file())
