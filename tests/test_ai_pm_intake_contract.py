from __future__ import annotations
import sys
from pathlib import Path
import unittest

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
import aipm_core  # noqa: E402


class IntakeContractTests(unittest.TestCase):
    def test_main_facade_and_permissions_dispatch_intake(self):
        facade = (REPO / ".claude/skills/ai-pm/SKILL.md").read_text(encoding="utf-8")
        settings = (REPO / ".claude/settings.json").read_text(encoding="utf-8")
        self.assertIn("Skill(ai-pm-intake)", facade)
        self.assertIn('"Skill(ai-pm-intake)"', settings)
        self.assertIn("`/ai-pm intake", facade)  # 前缀断言：命令表写作 `/ai-pm intake [路径]`

    def test_registry_entry_matches_disk_and_dispatch(self):
        registry = aipm_core.load_json(REPO / "templates/configs/capability-registry.json")
        errors, warnings = aipm_core.validate_capability_registry(registry)
        self.assertEqual(errors, [])
        self.assertFalse(any("尚未登记" in w for w in warnings))
        entry = next(c for c in registry["capabilities"] if c["id"] == "intake")
        self.assertEqual(entry["skill"], "ai-pm-intake")
        self.assertEqual(entry["legacy_commands"], ["/ai-pm intake"])
        self.assertEqual(entry["modes"], [])
        self.assertEqual(entry["phase_effect"], {"kind": "none"})

    def test_skill_declares_readonly_scan_boundary(self):
        text = (REPO / ".claude/skills/ai-pm-intake/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("只复制不移动", text)
        self.assertIn("不自动合并", text)
        self.assertIn("stage", text)  # stage 置位职责在 skill 层

    def test_container_registered(self):
        reg = (REPO / ".claude/skills/ai-pm/references/output-containers.md").read_text(encoding="utf-8")
        self.assertIn("`_intake/`", reg)


if __name__ == "__main__":
    unittest.main()
