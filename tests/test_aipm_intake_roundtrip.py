# tests/test_aipm_intake_roundtrip.py
"""端到端：假乱目录 → scan → apply（多簇）→ 结构/active_prd/baseline 断言 →
注入 claims（模拟 Claude 步骤）→ gate 过 → 假仓 status_migrate --validate。"""
import importlib.util, json, re, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aipm_core  # noqa: E402


def _load_mod(name, rel):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec); assert spec.loader; spec.loader.exec_module(mod)
    return mod


scan_mod = _load_mod("aipm_intake_scan", "scripts/aipm_intake_scan.py")
apply_mod = _load_mod("aipm_intake_apply", "scripts/aipm_intake_apply.py")
MESSY = ROOT / "tests/fixtures/intake/messy"


class RoundtripTests(unittest.TestCase):
    def test_full_chain_claims_gate_and_validate(self):
        with tempfile.TemporaryDirectory() as d:
            work = Path(d)
            repo = work / "repo"
            (repo / "output/projects").mkdir(parents=True)
            (repo / "scripts").mkdir()
            for f in ("aipm_contracts.py", "aipm_core.py", "status_migrate.py", "aipm_reconcile.py"):
                src = ROOT / "scripts" / f
                if src.exists():
                    (repo / "scripts" / f).write_bytes(src.read_bytes())
            (repo / "templates/configs").mkdir(parents=True)
            (repo / "templates/configs/capability-registry.json").write_text(
                '{"schema_version":1,"modes":[],"capabilities":[]}', encoding="utf-8")
            # status_migrate 的 SCHEMA/REGISTRY 按脚本位置解析到假仓，需带上这两份
            for rel in ("templates/project-index/status.schema.json", "templates/configs/workflow-phases.json"):
                (repo / rel).parent.mkdir(parents=True, exist_ok=True)
                (repo / rel).write_bytes((ROOT / rel).read_bytes())
            manifest = scan_mod.scan(MESSY, work / "_intake", extra_skill_dirs=())
            mpath = work / "_intake" / manifest["intake_id"] / "manifest.json"
            ids = [c["cluster_id"] for c in manifest["clusters"] if c["source_dirs"] == ["项目A"]]
            apply_mod.cmd_project(str(mpath), ids, "项目A", active_prd="需求/PRD-V1.md", repo=repo)
            proj = repo / "output/projects/项目A"
            for sub in ("01-requirement-draft", "05-prd", "06-prototype/_imported", "_memory", "08-reviews"):
                self.assertTrue((proj / sub).is_dir(), f"缺 {sub}")
            self.assertTrue((proj / "05-prd/需求/PRD-V1.md").is_file())
            self.assertTrue((proj / "06-prototype/_imported/原型/index.html").is_file())
            status = json.loads((proj / "_status.json").read_text(encoding="utf-8"))
            self.assertEqual(status["active_prd"], "需求/PRD-V1.md")
            errors, _ = aipm_core.validate_status_artifacts(status, proj)
            self.assertEqual(errors, [], f"status 违约: {errors}")
            # claims gate：空 claims 先被拦 → 注入一条（模拟 Claude 提炼）→ 过
            baseline = json.loads((proj / "01-baseline-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(baseline["claims"], [])
            gate_hit = lambda errs: any("claims 为空" in e for e in errs)
            self.assertTrue(gate_hit(aipm_core.validate_baseline(baseline)[0]), "import 类型空 claims 应被 gate 拦")
            # 注入的就是 SKILL.md「claims 提炼」节的最小示例原文（文档与 gate 不可能漂移）
            skill_doc = (ROOT / ".claude/skills/ai-pm-intake/SKILL.md").read_text(encoding="utf-8")
            m_json = re.search(r"```json\n(.*?)```", skill_doc, re.S)
            self.assertIsNotNone(m_json, "SKILL.md 缺 claims 最小示例")
            example = json.loads(m_json.group(1))
            self.assertEqual(set(example["claims"][0]), {"claim_id", "kind", "statement", "risk", "state",
                                                          "source_ids", "aliases"})
            self.assertEqual(set(example["sources"][0]), {"source_id", "kind", "path_or_remote_id",
                                                           "observed_at", "authority"})
            baseline["claims"], baseline["sources"] = example["claims"], example["sources"]
            # verify 先于 claims：必须失败且不写 done
            with self.assertRaises(SystemExit):
                apply_mod.cmd_verify(str(mpath), "项目A", repo=repo)
            (proj / "01-baseline-manifest.json").write_text(
                json.dumps(baseline, ensure_ascii=False, indent=1), encoding="utf-8")
            self.assertEqual(aipm_core.validate_baseline(baseline)[0], [], "注入后 baseline 必须零错误")
            self.assertIn("通过", apply_mod.cmd_verify(str(mpath), "项目A", repo=repo))
            self.assertIn(f"未处理簇 {len(manifest['clusters']) - 1}", apply_mod.cmd_finish(str(mpath)))
            # R13：spec 执行第 6 步——假仓自己的 status_migrate --validate（schema 层检查）
            r = subprocess.run([sys.executable, str(repo / "scripts/status_migrate.py"), "--validate"],
                               capture_output=True, text=True, cwd=str(repo))
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn("项目A", r.stdout)
            # migrated.jsonl 审计留痕
            lines = (mpath.parent / "migrated.jsonl").read_text(encoding="utf-8").strip().splitlines()
            self.assertTrue(lines)
            for line in lines:
                rec = json.loads(line)
                self.assertTrue(rec.get("sha256") or rec.get("action") == "skip")


if __name__ == "__main__":
    unittest.main()
