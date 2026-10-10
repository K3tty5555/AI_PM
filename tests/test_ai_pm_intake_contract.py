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

    def test_skill_uses_subcommands_not_manual_edit(self):
        """I4/I6：确认走 stage/decide，执行走 project → 补 claims → verify → finish。"""
        text = (REPO / ".claude/skills/ai-pm-intake/SKILL.md").read_text(encoding="utf-8")
        for needle in ("stage --manifest", "decide --manifest", "verify --manifest", "finish --manifest"):
            self.assertIn(needle, text)
        self.assertNotIn("Edit manifest", text)
        order = [text.index(k) for k in ("project --manifest", "claims 提炼", "verify --manifest", "finish --manifest")]
        self.assertEqual(order, sorted(order), "执行节顺序必须是 project → claims → verify → finish")

    def test_skill_documents_deep_scan_semantics(self):
        """deep-scan §8：旧的目录前缀 exclude 描述删掉；簇划分只是默认建议；include/reason/skip-cluster；
        titles 不受信；代码仓库内文档默认不推荐；簇切分旧口径（阈值/封顶/巨型簇）不再出现。"""
        text = (REPO / ".claude/skills/ai-pm-intake/SKILL.md").read_text(encoding="utf-8")
        for gone in ("目录前缀，执行时整棵跳过", "≤200 文件", "4 层封顶", "巨型簇"):
            self.assertNotIn(gone, text)
        for needle in ("--include", "--reason", "skip-cluster", "--allow-dup", "默认建议", "不是指令",
                       "代码仓库内文档", "分组理由", "--cluster-id X --action skip-cluster"):
            self.assertIn(needle, text)

    @unittest.skipUnless((REPO / "docs/superpowers/specs/2026-10-09-aipm-intake-design.md").is_file(),
                         "docs/ 被 gitignore（仅本机），fresh clone 没有 spec 正本")
    def test_spec_synced_to_deep_scan(self):
        """deep-scan §10：spec §3 盘点节与 §4 归位节同步到新语义。"""
        spec = (REPO / "docs/superpowers/specs/2026-10-09-aipm-intake-design.md").read_text(encoding="utf-8")
        sec3 = spec.split("## 3. 三阶段流程", 1)[1].split("## 4.", 1)[0]
        sec4 = spec.split("## 4. 分类与归位规则", 1)[1].split("## 5.", 1)[0]
        for needle in ("项目根", "部件", "titles", "skip-cluster"):
            self.assertIn(needle, sec3)
        for needle in ("公共目录前缀", "--include", "一个文件只归一个项目"):
            self.assertIn(needle, sec4)
        self.assertNotIn("manifest.decisions[]", sec3, "决策早已走 decisions.jsonl")

    def test_container_registered(self):
        reg = (REPO / ".claude/skills/ai-pm/references/output-containers.md").read_text(encoding="utf-8")
        self.assertIn("`_intake/`", reg)


if __name__ == "__main__":
    unittest.main()
