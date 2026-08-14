from __future__ import annotations

import datetime as dt
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[1]
SCRIPTS = REPO / "scripts"
sys.path.insert(0, str(SCRIPTS))

import aipm_contracts  # noqa: E402
import aipm_core  # noqa: E402
import aipm_impact  # noqa: E402
import aipm_reconcile  # noqa: E402


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载模块: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class EvalCorpusTests(unittest.TestCase):
    def test_development_and_cold_cases_are_explicitly_separated(self):
        path = REPO / "tests/fixtures/nextgen/eval-cases.json"
        corpus = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(
            [item["id"] for item in corpus["development_cases"]],
            [f"R{number}" for number in range(1, 8)],
        )
        self.assertEqual(
            {item["id"] for item in corpus["cold_cases"]},
            {"COLD-1", "COLD-2"},
        )
        for item in corpus["development_cases"]:
            self.assertTrue(item["negative_control"])


class CapabilityAndBaselineTests(unittest.TestCase):
    def test_six_modes_are_an_intent_facade_not_a_second_phase_state(self):
        registry = aipm_core.load_json(
            REPO / "templates/configs/capability-registry.json"
        )
        errors, warnings = aipm_core.validate_capability_registry(registry)
        self.assertEqual(errors, [])
        self.assertFalse(any("尚未登记" in item for item in warnings))
        self.assertEqual(
            [mode["label"] for mode in registry["modes"]],
            ["探索研究", "决策分析", "PRD", "原型", "评审验收", "运营复盘"],
        )
        self.assertTrue(all("phase" not in mode for mode in registry["modes"]))

    def test_new_skills_are_allowed_by_project_runtime(self):
        settings = aipm_core.load_json(REPO / ".claude/settings.json")
        allowed = settings["permissions"]["allow"]
        self.assertIn("Skill(ai-pm-reconcile)", allowed)
        self.assertIn("Skill(ai-pm-impact)", allowed)
        self.assertIn("Skill(ai-pm-retrospective)", allowed)

    def test_main_facade_uses_exact_skill_dispatch_without_phase_side_effect(self):
        text = (REPO / ".claude/skills/ai-pm/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("Skill(ai-pm-reconcile)", text)
        self.assertIn("Skill(ai-pm-impact)", text)
        self.assertIn("不更新 phase、checkpoint、status、baseline 或产物", text)

    def test_iteration_baseline_blocks_high_risk_claim_without_source(self):
        baseline = {
            "schema_version": 1,
            "project": "示例",
            "project_type": "iteration",
            "generated_at": "2026-08-14T00:00:00+08:00",
            "sources": [],
            "claims": [{
                "claim_id": "scope.current",
                "kind": "current-fact",
                "statement": "现有流程支持该能力",
                "risk": "high",
                "state": "active",
                "source_ids": [],
                "aliases": [],
            }],
            "open_questions": [],
        }
        errors, _ = aipm_core.validate_baseline(baseline)
        self.assertTrue(any("高风险 claim 无来源" in item for item in errors))
        baseline["sources"] = [{
            "source_id": "source.current",
            "kind": "current-product",
            "path_or_remote_id": "evidence:current",
            "observed_at": "2026-08-14",
            "authority": "confirmed",
        }]
        baseline["claims"][0]["source_ids"] = ["source.current"]
        self.assertEqual(aipm_core.validate_baseline(baseline)[0], [])

    def test_bootstrap_is_preview_first_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory(prefix="aipm-bootstrap-test-") as raw:
            project = Path(raw)
            (project / "05-prd").mkdir()
            (project / "05-prd/current.md").write_text("# PRD\n", encoding="utf-8")
            status_path = project / "_status.json"
            status_path.write_text(json.dumps({
                "schema_version": 1,
                "project": "示例",
                "lifecycle": "active",
                "updated": "2026-08-14",
                "active_prd": "current.md",
            }, ensure_ascii=False), encoding="utf-8")
            before = status_path.read_bytes()
            command = [
                sys.executable,
                str(REPO / "scripts/aipm_contracts.py"),
                "bootstrap",
                "--project",
                str(project),
                "--type",
                "iteration",
            ]
            preview = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(preview.returncode, 0, preview.stderr)
            self.assertFalse((project / "01-baseline-manifest.json").exists())
            self.assertEqual(status_path.read_bytes(), before)

            applied = subprocess.run(command + ["--apply"], capture_output=True, text=True)
            self.assertEqual(applied.returncode, 0, applied.stderr)
            self.assertTrue((project / "01-baseline-manifest.json").is_file())
            second = subprocess.run(command + ["--apply"], capture_output=True, text=True)
            self.assertEqual(second.returncode, 2)
            self.assertIn("不覆盖", second.stderr)


class ArtifactContractTests(unittest.TestCase):
    def test_reconcile_selftest_covers_residual_negative_and_local_edit(self):
        self.assertEqual(aipm_reconcile.selftest(), 0)

    def test_whats_next_reads_artifact_contract_without_migrating(self):
        module = load_module(
            REPO / "scripts/ai-sync/whats-next.py",
            "whats_next_contract_test",
        )
        with tempfile.TemporaryDirectory(prefix="aipm-whats-next-test-") as raw:
            projects = Path(raw)
            project = projects / "示例"
            project.mkdir()
            status = {
                "schema_version": 1,
                "project": "示例",
                "lifecycle": "active",
                "updated": "2026-08-14",
                "artifacts": [{
                    "artifact_id": "prd.current",
                    "type": "prd",
                    "path_or_remote_id": "05-prd/missing.md",
                    "authoritative_source": "local-primary",
                    "producer_capability": "prd",
                    "dependencies": [],
                    "owner": "shared",
                    "status": "current",
                    "last_verified_at": "2026-08-14T00:00:00+08:00",
                }],
            }
            original_projects = module.PROJECTS
            module.PROJECTS = projects
            try:
                (project / "_status.json").write_text(
                    json.dumps(status, ensure_ascii=False),
                    encoding="utf-8",
                )
                before = (project / "_status.json").read_bytes()
                rows = module.build({"示例": {"newestDate": "2026-08-14"}})
                self.assertTrue(rows[0]["contract_issues"])
                self.assertEqual((project / "_status.json").read_bytes(), before)
            finally:
                module.PROJECTS = original_projects

    def test_prototype_requires_both_devices_and_preserves_missing_semantics(self):
        with tempfile.TemporaryDirectory(prefix="aipm-prototype-test-") as raw:
            project = Path(raw)
            manifest_dir = project / "06-prototype"
            manifest_dir.mkdir()
            manifest = {
                "schema_version": 1,
                "project": "示例",
                "generated_at": "2026-08-14T00:00:00+08:00",
                "devices": [{
                    "device": "web",
                    "evidence_status": "verified",
                    "source_evidence": ["screenshot:web"],
                    "current_state": ["已有列表"],
                    "target_changes": ["增加筛选"],
                    "unchanged": ["导航"],
                }],
            }
            path = manifest_dir / "source-target-manifest.json"
            path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            errors, _ = aipm_contracts.validate_prototype_manifest(project)
            self.assertTrue(any("缺少: mobile" in item for item in errors))

            manifest["devices"].append({
                "device": "mobile",
                "evidence_status": "missing",
                "source_evidence": [],
                "current_state": [],
                "target_changes": [],
                "unchanged": [],
            })
            path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            errors, warnings = aipm_contracts.validate_prototype_manifest(project)
            self.assertEqual(errors, [])
            self.assertTrue(any("不能宣称完成" in item for item in warnings))

            manifest["devices"][1]["evidence_status"] = "not-applicable"
            path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(
                aipm_contracts.validate_prototype_manifest(project),
                ([], []),
            )

    def test_prd_detail_contract_has_positive_and_negative_controls(self):
        with tempfile.TemporaryDirectory(prefix="aipm-prd-test-") as raw:
            root = Path(raw)
            good = root / "good.md"
            good.write_text(
                "# 示例\n\n## 一、文档概述\n\n## 二、需求分析\n\n"
                "## 三、功能清单\n\n## 六、详细功能设计\n\n### 6.1 功能\n\n"
                "| 项目 | 说明 |\n|---|---|\n| **用户场景** | 处理任务 |\n"
                "| **功能描述** | 完成处理 |\n| **原型示意** | 无界面交互 |\n"
                "| **影响范围** | 任务页 |\n",
                encoding="utf-8",
            )
            self.assertEqual(aipm_contracts.validate_prd(good), ([], []))
            bad = root / "bad.md"
            bad.write_text(
                "# 示例\n\n## 一、文档概述\n\n## 二、需求分析\n\n"
                "## 三、功能清单\n\n## 六、详细功能设计\n\n### 6.1 功能\n\n长段落\n",
                encoding="utf-8",
            )
            errors, _ = aipm_contracts.validate_prd(bad)
            self.assertTrue(any("两列表" in item for item in errors))
            decision = root / "decision.md"
            decision.write_text("---\ndoctype: decision-review\n---\n# 决策\n", encoding="utf-8")
            self.assertEqual(aipm_contracts.validate_prd(decision), ([], []))

    def test_cloud_ownership_blocks_cloud_primary_and_mixed_publish(self):
        with tempfile.TemporaryDirectory(prefix="aipm-cloud-test-") as raw:
            project = Path(raw)
            (project / "05-prd").mkdir()
            prd = project / "05-prd/current.md"
            prd.write_text("# PRD\n", encoding="utf-8")
            status = {
                "schema_version": 1,
                "project": "示例",
                "lifecycle": "active",
                "updated": "2026-08-14",
                "active_prd": "current.md",
                "artifacts": [{
                    "artifact_id": "prd.current",
                    "type": "prd",
                    "path_or_remote_id": "05-prd/current.md",
                    "authoritative_source": "local-primary",
                    "version_or_hash": aipm_core.sha256_file(prd),
                    "producer_capability": "prd",
                    "dependencies": [],
                    "owner": "shared",
                    "status": "current",
                    "last_verified_at": "2026-08-14T00:00:00+08:00",
                }],
            }
            status_path = project / "_status.json"
            status_path.write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")
            errors, warnings = aipm_contracts.validate_cloud_ownership(project, "publish")
            self.assertEqual(errors, [])
            self.assertTrue(any("现有 prd_publish" in item for item in warnings))
            for authority in ("cloud-primary", "mixed"):
                status["artifacts"][0]["authoritative_source"] = authority
                status_path.write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")
                errors, warnings = aipm_contracts.validate_cloud_ownership(project, "publish")
                self.assertTrue(errors, authority)
                if authority == "mixed":
                    self.assertTrue(any("ownership_rules" in item for item in warnings))


class ImpactAndFreshnessTests(unittest.TestCase):
    def test_impact_explicit_write_registers_artifact_and_preview_does_not(self):
        with tempfile.TemporaryDirectory(prefix="aipm-impact-write-test-") as raw:
            project = Path(raw)
            status_path = project / "_status.json"
            status_path.write_text(json.dumps({
                "schema_version": 1,
                "project": "示例",
                "lifecycle": "active",
                "updated": "2026-08-14",
                "artifacts": [],
            }, ensure_ascii=False), encoding="utf-8")
            command = [
                sys.executable,
                str(REPO / "scripts/aipm_impact.py"),
                "init",
                "--project",
                str(project),
                "--objective",
                "减少重复操作",
            ]
            before = status_path.read_bytes()
            preview = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(preview.returncode, 0, preview.stderr)
            self.assertEqual(status_path.read_bytes(), before)
            self.assertFalse((project / "09-analytics/impact-record.json").exists())

            applied = subprocess.run(command + ["--write"], capture_output=True, text=True)
            self.assertEqual(applied.returncode, 0, applied.stderr)
            status = json.loads(status_path.read_text(encoding="utf-8"))
            artifact = status["artifacts"][0]
            self.assertEqual(artifact["artifact_id"], "impact.record")
            self.assertEqual(
                artifact["version_or_hash"],
                aipm_core.sha256_file(project / "09-analytics/impact-record.json"),
            )
            report_path = project / "09-analytics/impact-report.md"
            rendered = subprocess.run([
                sys.executable,
                str(REPO / "scripts/aipm_impact.py"),
                "render",
                "--record",
                str(project / "09-analytics/impact-record.json"),
                "--out",
                str(report_path),
            ], capture_output=True, text=True)
            self.assertEqual(rendered.returncode, 0, rendered.stderr)
            status = json.loads(status_path.read_text(encoding="utf-8"))
            self.assertEqual(
                {item["artifact_id"] for item in status["artifacts"]},
                {"impact.record", "impact.report"},
            )
            self.assertEqual(
                next(item for item in status["artifacts"] if item["artifact_id"] == "impact.report")["version_or_hash"],
                aipm_core.sha256_file(report_path),
            )

    def test_rate_metric_requires_stable_definition_and_evidence(self):
        record = {
            "schema_version": 1,
            "project": "示例",
            "objective": {"statement": "改善完成率"},
            "release_anchor": {"released_at": "2026-08-01", "evidence": "release:1"},
            "metrics": [{
                "metric_id": "completion-rate",
                "name": "完成率",
                "kind": "rate",
                "definition": "完成目标动作的目标用户占比",
                "numerator": "",
                "denominator": "进入流程的目标用户数",
                "version": "2026-08",
                "baseline": {"value": "20%", "observed_at": "2026-07-01", "source": "data:baseline"},
                "observations": [{"value": "25%", "observed_at": "2026-08-10", "source": "data:observation"}],
            }],
            "qualitative_evidence": [],
            "conclusion": {"decision": "continue", "rationale": "改善", "evidence_ids": ["completion-rate"]},
            "fact_updates": [],
        }
        errors, _ = aipm_impact.validate_record(record)
        self.assertTrue(any("numerator" in item for item in errors))
        record["metrics"][0]["numerator"] = "完成目标动作的目标用户数"
        self.assertEqual(aipm_impact.validate_record(record), ([], []))
        record["fact_updates"] = [{
            "target": "baseline",
            "statement": "完成率已改善",
            "evidence_ids": ["unknown-evidence"],
        }]
        errors, _ = aipm_impact.validate_record(record)
        self.assertTrue(any("引用未知" in item for item in errors))

    def test_conversation_coverage_uses_index_bounds_and_months(self):
        module = load_module(
            REPO / "scripts/ai-sync/conversation-coverage.py",
            "conversation_coverage_nextgen_test",
        )
        records = [{
            "source": "claude",
            "first_ts": "2026-07-01T00:00:00+08:00",
            "last_ts": "2026-07-31T23:59:59+08:00",
        }]
        report = module.assess_coverage(
            records,
            dt.date(2026, 7, 1),
            dt.date(2026, 8, 14),
            {"claude"},
        )
        self.assertEqual(report["status"], "coverage-gap")
        self.assertIn("2026-08", report["missing_months"])


if __name__ == "__main__":
    unittest.main()
