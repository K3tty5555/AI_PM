from __future__ import annotations

import json
import re
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
        # 只看入库 skill：作者机上 intake 装过的外部 skill 登记在本机注册表，不该让契约测试变红
        errors, warnings = aipm_core.validate_capability_registry(
            registry, disk_skills=aipm_core.tracked_skill_names(REPO))
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

    @staticmethod
    def _section(text: str, heading: str) -> str:
        """取「标题行 → 下一个 ## 或 ### 标题」之间的正文；标题不存在时返回空串（断言随即报红）。"""
        start = text.find(heading + "\n")
        if start < 0:
            return ""
        rest = text[start + len(heading) + 1:]
        m = re.search(r"^#{2,3} ", rest, re.M)
        return rest[:m.start()] if m else rest

    def test_update_docs_use_new_package_layout(self):
        skill_dir = REPO / ".claude/skills/ai-pm-update"
        skill = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
        docs = skill + "\n".join(p.read_text(encoding="utf-8")
                                 for p in sorted((skill_dir / "references").glob("*.md")))
        for old in ("meta/versions.json", "--from", "tree/"):
            self.assertNotIn(old, docs, f"升级说明残留旧包格式写法：{old}")
        front = skill.split("\n---\n", 1)[0]
        for tool in ("Bash(pwd)", "Bash(realpath)"):
            self.assertIn(tool, front, f"allowed-tools 缺 {tool}")
        expect = {
            "### 阶段 0：先读新版规则": ("按新版规则执行", "/add-dir"),
            "### 阶段 1：识别": ("-ef", "realpath", "content_digest", "probe_paths", "续跑", "疑似", "至少 4 个",
                             "Read"),
            "### 阶段 3：执行": (".aipm-dist.new", "aipm-dist.old", "不推进", "复制成 `base.json`"),
            "### 阶段 4：报告": ("install_dir", "可以删掉"),
            "## `rollback`": ("install_dir", "aipm-dist.old"),
            "## 中断保护": (".aipm-dist.incomplete",),
        }
        for heading, keys in expect.items():
            body = self._section(skill, heading)
            self.assertTrue(body, f"缺章节：{heading}")
            for key in keys:
                self.assertIn(key, body, f"{heading} 缺：{key}")
        facade = (REPO / ".claude/skills/ai-pm/SKILL.md").read_text(encoding="utf-8")
        section = self._section(facade, "### `update` 命令分派")
        self.assertNotIn("--from", section)
        self.assertIn("<新包文件夹>", section)


if __name__ == "__main__":
    unittest.main()
