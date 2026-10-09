# tests/test_aipm_intake_scan.py
"""intake 扫描器测试：排除表 / 分类 / 哈希去重 / 凭证 / sanitize / 簇聚合 / 仓库根排除 / 报告。"""
import importlib.util, json, tempfile
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("aipm_intake_scan", ROOT / "scripts/aipm_intake_scan.py")
module = importlib.util.module_from_spec(_spec); assert _spec.loader; _spec.loader.exec_module(module)
MESSY = ROOT / "tests/fixtures/intake/messy"


class TestScan(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        # collision 检测面注入固定空集：测试不绑 ~/.claude/skills 本机状态
        self.manifest = module.scan(MESSY, Path(self.tmp.name), extra_skill_dirs=())

    def files_of(self, klass):
        return [f["path"] for c in self.manifest["clusters"] for f in c["files"] if f["klass"] == klass]

    def test_fixture_intact_then_exclusions(self):
        # fixture 完整性先行断言：任一被 gitignore 静默吞掉，下面的排除断言就是空转
        for rel in ("node_modules/junk/x.js", ".env", ".DS_Store", "fake-aipm-repo/CLAUDE.md"):
            self.assertTrue((MESSY / rel).exists(), f"fixture 缺 {rel}（检查 tests/.gitignore 白名单）")
        all_paths = [f["path"] for c in self.manifest["clusters"] for f in c["files"]]
        self.assertFalse(any("node_modules" in p for p in all_paths))
        self.assertFalse(any(".DS_Store" in p for p in all_paths))
        self.assertFalse(any("fake-aipm-repo" in p for p in all_paths), "AI_PM 仓库根必须整棵排除")
        self.assertGreater(self.manifest["scope"]["excluded"]["node_modules"], 0)

    def test_classification(self):
        self.assertTrue(any("PRD-V1.md" in p for p in self.files_of("md")))
        self.assertTrue(any("index.html" in p for p in self.files_of("html")))
        self.assertTrue(any("家庭照片.png" in f["path"] for f in self.manifest["unclassified"]))

    def test_duplicates_detected_by_hash(self):
        dups = self.manifest["duplicates"]
        self.assertEqual(len(dups), 1)
        self.assertEqual(len(dups[0]["paths"]), 2)

    def test_credential_default_skip(self):
        self.assertTrue(any(p.endswith(".env") for p in self.manifest["credential_hits"]))

    def test_skill_candidate_detected(self):
        cand = next(s for s in self.manifest["skill_candidates"] if s["name"] == "my-helper")
        self.assertTrue(cand["frontmatter_ok"])
        self.assertEqual(cand["collisions"], [])
        self.assertEqual(cand["status"], "installable")

    def test_prompt_asset(self):
        self.assertTrue(any("PM提示词" in a["path"] for a in self.manifest["prompt_assets"]))

    def test_manifest_stage_and_scope(self):
        self.assertEqual(self.manifest["stage"], "scan")
        self.assertIn("total_files", self.manifest["scope"])

    def test_sanitize(self):
        self.assertEqual(module.sanitize_name(' 项目/:A*?"<>|名 '), "项目-A-名")

    def test_unfinished_listing(self):
        # 独立临时目录：setUp 的 scan 产物 stage=scan 也在本目录的话会混进结果
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "x" / "manifest.json"
            p.parent.mkdir(parents=True)
            p.write_text(json.dumps({"stage": "confirm"}), encoding="utf-8")
            self.assertEqual(module.list_unfinished(Path(d)), [str(p)])

    def test_report_md_written(self):
        report = Path(self.tmp.name) / self.manifest["intake_id"] / "report.md"
        self.assertTrue(report.is_file())
        text = report.read_text(encoding="utf-8")
        self.assertIn("扫描范围", text)
        self.assertIn("未归类", text)
        self.assertIn("prompt", text)                 # R18：能力资产清单进报告
        self.assertIn("复制总量", text)                # R18：总量预估进报告


if __name__ == "__main__":
    unittest.main()
