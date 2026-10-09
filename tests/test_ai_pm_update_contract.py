from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest


REPO = Path(__file__).resolve().parents[1]
SCRIPTS = REPO / "scripts"
sys.path.insert(0, str(SCRIPTS))

import aipm_core  # noqa: E402


class UpdateContractTests(unittest.TestCase):
    def test_main_facade_and_permissions_dispatch_update(self):
        facade = (REPO / ".claude/skills/ai-pm/SKILL.md").read_text(encoding="utf-8")
        settings = (REPO / ".claude/settings.json").read_text(encoding="utf-8")
        self.assertIn("Skill(ai-pm-update)", facade)
        self.assertIn('"Skill(ai-pm-update)"', settings)
        # 路由表指向的形态必须与 legacy_commands 一致
        self.assertIn("`/ai-pm update`", facade)

    def test_registry_entry_matches_disk_and_dispatch(self):
        registry = aipm_core.load_json(REPO / "templates/configs/capability-registry.json")
        errors, warnings = aipm_core.validate_capability_registry(registry)
        self.assertEqual(errors, [])
        self.assertFalse(any("尚未登记" in item for item in warnings))
        entries = [c for c in registry["capabilities"] if c.get("id") == "ai-pm-update"]
        self.assertEqual(len(entries), 1, "ai-pm-update 必须且只能登记一条")
        entry = entries[0]
        self.assertEqual(entry["skill"], "ai-pm-update")
        self.assertEqual(entry["legacy_commands"], ["/ai-pm update"])
        # 升级不改项目 phase：mode / phase_effect 都不得声明副作用
        self.assertEqual(entry["modes"], [])
        self.assertEqual(entry["phase_effect"], {"kind": "none"})

    def test_update_skill_keeps_three_reference_single_sources(self):
        skill = REPO / ".claude/skills/ai-pm-update"
        self.assertTrue((skill / "SKILL.md").is_file())
        for ref in ("managed-scope.md", "merge-protocol.md", "report-format.md"):
            self.assertTrue(
                (skill / "references" / ref).is_file(),
                f"单一事实源缺失: references/{ref}",
            )


if __name__ == "__main__":
    unittest.main()
