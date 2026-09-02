#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "aipm_prototype_collab.py"
SPEC_PATH = ROOT / "output" / "assets" / "AI_PM原型协作闭环开源选型" / "demo" / "prototype-spec.json"

spec = importlib.util.spec_from_file_location("aipm_prototype_collab", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(module)


class PrototypeCollabTests(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))

    def test_spec_is_valid(self):
        self.assertEqual(module.validate_spec(self.spec), [])

    def test_missing_frame_reference_is_rejected(self):
        broken = copy.deepcopy(self.spec)
        broken["flows"][0]["steps"][0]["state_id"] = "missing"
        errors = module.validate_spec(broken)
        self.assertTrue(any("不存在的关键帧" in error for error in errors))

    def test_lowfi_contains_every_keyframe_and_comment_controls(self):
        rendered = module.render_lowfi(self.spec)
        expected_frames = sum(len(page["states"]) for page in self.spec["pages"])
        self.assertEqual(rendered.count('class="frame-card"'), expected_frames)
        self.assertIn("所有关键帧均在本页展示", rendered)
        self.assertIn("写下这个页面或状态需要调整的地方", rendered)
        self.assertIn("lowfi-approval.json", rendered)
        self.assertIn('class="frame-main"', rendered)
        self.assertLess(rendered.index('class="wire-canvas"'), rendered.index('class="frame-review"'))

    def test_review_contains_real_prototype_frames(self):
        approval = {"spec_hash": module.content_hash(self.spec), "decision": "approved"}
        rendered = module.render_review(self.spec, "../index.html", "abc123", approval)
        expected_frames = sum(len(page["states"]) for page in self.spec["pages"])
        self.assertEqual(rendered.count("<iframe "), 1)
        self.assertEqual(rendered.count('class="frame-nav-item"'), expected_frames)
        self.assertIn("从左侧切换关键页面", rendered)
        self.assertIn("上一页", rendered)
        self.assertIn("下一页", rendered)
        self.assertIn('id="toggleNav"', rendered)
        self.assertIn('id="toggleInspector"', rendered)
        self.assertIn("aipm:review-shell", rendered)
        self.assertIn("(()=>{'use strict';", rendered)
        self.assertIn('id="frameState"', rendered)
        self.assertIn('<link rel="icon" href="data:,">', rendered)
        self.assertNotIn("let chrome=", rendered)
        self.assertIn("aipm_rev=abc123", rendered)
        self.assertIn("review-feedback.json", rendered)

    def test_review_requires_current_lowfi_approval(self):
        with self.assertRaises(module.SpecError):
            module.render_review(self.spec, "../index.html", "abc123", {"decision": "approved"})
        stale = {"spec_hash": "0" * 64, "decision": "approved"}
        with self.assertRaises(module.SpecError):
            module.render_review(self.spec, "../index.html", "abc123", stale)

    def test_visual_tokens_can_override_defaults(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "tokens.json"
            path.write_text(json.dumps({"tokens": {"accent": "#ff5500", "card_radius": "8px"}}), encoding="utf-8")
            tokens = module.load_visual_tokens(path)
            self.assertEqual(tokens["accent"], "#ff5500")
            self.assertIn("--aipm-accent:#ff5500", module.visual_token_css(tokens))
            self.assertIn("#ff5500", module.annotation_runtime(tokens))

    def test_emit_tokens_has_complete_schema(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "visual-tokens.json"
            args = type("Args", (), {"out": str(path)})()
            self.assertEqual(module.command_emit_tokens(args), 0)
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data["schema_version"], 1)
            self.assertEqual(set(module.DEFAULT_VISUAL_TOKENS), set(data["tokens"]))

    def test_scan_source_outputs_relative_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "pages").mkdir()
            (root / "pages" / "home.html").write_text("<title>Home</title><style>.x{display:grid;color:#123456;font-family:Inter}</style>", encoding="utf-8")
            (root / "Button.tsx").write_text("export function Button(){ return <button/> }", encoding="utf-8")
            report = module.scan_source_tree(root)
            self.assertEqual(report["summary"]["pages"], 1)
            self.assertIn("Button", report["components"])
            self.assertIn("#123456", report["colors"])
            self.assertTrue(all(not item["path"].startswith("/") for item in report["evidence_files"]))

    def test_prototype_diff_reports_added_stable_elements(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old = root / "old.html"
            new = root / "new.html"
            old.write_text("<html><body><h1>Old</h1><button id='save'>保存</button></body></html>", encoding="utf-8")
            new.write_text("<html><body><h1>New</h1><button id='save'>保存</button><button id='review'>巡检</button></body></html>", encoding="utf-8")
            diff = module.prototype_diff(old, new)
            self.assertTrue(diff["changed"])
            self.assertEqual(diff["ids"]["added"], ["review"])
            self.assertEqual(diff["headings"]["added"], ["New"])

    def test_unified_acceptance_passes_static_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            spec = root / "spec.json"
            lowfi = root / "lowfi.html"
            review = root / "review.html"
            prototype = root / "prototype.html"
            approval = root / "approval.json"
            for path in (lowfi, review, prototype):
                path.write_text("<!doctype html><html><body><main>ok</main></body></html>", encoding="utf-8")
            spec.write_text(json.dumps(self.spec, ensure_ascii=False), encoding="utf-8")
            approval.write_text(json.dumps({"spec_hash": module.content_hash(self.spec), "decision": "approved"}), encoding="utf-8")
            args = type("Args", (), {"spec": str(spec), "approval": str(approval), "prototype": str(prototype), "review": str(review), "lowfi": str(lowfi), "tokens": None, "manifest": None, "feedback_dir": None, "browser_report": None})()
            self.assertEqual(module.command_accept(args), 0)

    def test_review_html_gate_checks_local_resources_and_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "runtime.js").write_text("", encoding="utf-8")
            valid = root / "valid.html"
            valid.write_text('<!doctype html><html><body><script src="runtime.js?v=1"></script><img src="data:,"/></body></html>', encoding="utf-8")
            self.assertEqual(module.validate_html_file(valid), [])
            invalid = root / "invalid.html"
            invalid.write_text('<html><body><script src="missing.js"></script><div id="x"></div><span id="x"></span></body></html>', encoding="utf-8")
            errors = module.validate_html_file(invalid)
            self.assertTrue(any("资源不存在" in error for error in errors))
            self.assertTrue(any("id 重复" in error for error in errors))

    def test_revision_query_is_stable_and_replaces_old_revision(self):
        self.assertEqual(module.with_revision("index.html?view=setup", "abcdef1234567890"), "index.html?view=setup&aipm_rev=abcdef123456")
        self.assertEqual(module.with_revision("index.html?view=setup&aipm_rev=old", "newrevision"), "index.html?view=setup&aipm_rev=newrevision")

    def test_instrument_is_idempotent_and_creates_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            html_path = root / "index.html"
            runtime_path = root / "runtime" / "annotation-runtime.js"
            html_path.write_text("<!doctype html><html><body><button data-aipm-id='save'>保存</button></body></html>", encoding="utf-8")
            module.write_text(runtime_path, module.annotation_runtime())
            first = module.instrument_html(self.spec, html_path, runtime_path)
            second = module.instrument_html(self.spec, html_path, runtime_path)
            self.assertEqual(first, "instrumented")
            self.assertEqual(second, "already-instrumented")
            self.assertTrue(html_path.with_suffix(".html.pre-annotation.bak").exists())
            self.assertEqual(html_path.read_text(encoding="utf-8").count(module.ANNOTATION_MARKER), 1)
            self.assertIn("data-aipm-route-map", html_path.read_text(encoding="utf-8"))
            self.assertIn("annotation-runtime.js?v=", html_path.read_text(encoding="utf-8"))

    def test_annotation_form_only_asks_for_type_and_content(self):
        runtime = module.annotation_runtime()
        self.assertIn('<label>类型<select id="type">', runtime)
        self.assertIn('<label>内容<textarea id="comment"', runtime)
        self.assertNotIn('<label>标题<input id="title"', runtime)
        self.assertNotIn('<label>文档关联<input id="doc"', runtime)
        self.assertNotIn('<label>期望结果<textarea id="expected"', runtime)
        self.assertIn('routeParams.delete("aipm_rev")', runtime)
        self.assertIn('id="remove">删除标签', runtime)
        self.assertIn("state.items.splice(index, 1)", runtime)

    def test_approval_gate_checks_spec_hash_and_decision(self):
        valid = {"spec_hash": module.content_hash(self.spec), "decision": "approved"}
        self.assertEqual(module.verify_approval(self.spec, valid), "approved")
        stale = copy.deepcopy(self.spec)
        stale["title"] = "changed"
        with self.assertRaises(module.SpecError):
            module.verify_approval(stale, valid)
        with self.assertRaises(module.SpecError):
            module.verify_approval(self.spec, {"spec_hash": valid["spec_hash"], "decision": "revise"})

    def test_feedback_summary_preserves_location_and_doc_reference(self):
        data = {
            "schema_version": 1,
            "project": "通用任务协作工具",
            "spec_hash": "12345678",
            "items": [{
                "feedback_id": "ann-1",
                "feedback_type": "change-request",
                "page_id": "task-editor",
                "state_id": "editing",
                "target_id": "save-task",
                "status": "open",
                "comment": "按钮文案改为创建任务",
                "expected": "动作更明确",
                "doc_refs": ["需求文档 4.2"],
                "replies": [{"reply_id": "reply-1", "author": "AI", "text": "会先生成修改预览", "created_at": "2026-09-01T00:00:00+08:00"}]
            }]
        }
        self.assertEqual(module.validate_feedback(data), [])
        preview = module.summarize_feedback(data)
        self.assertIn("task-editor/editing", preview)
        self.assertIn("save-task", preview)
        self.assertIn("需求文档 4.2", preview)
        self.assertIn("会先生成修改预览", preview)

    def test_feedback_file_names_are_stage_scoped(self):
        self.assertEqual(module.feedback_filename({"stage": "lowfi", "decision": "approved"}), "lowfi-approval.json")
        self.assertEqual(module.feedback_filename({"stage": "lowfi", "decision": "revise"}), "lowfi-feedback.json")
        self.assertEqual(module.feedback_filename({"stage": "highfi-review"}), "review-feedback.json")
        self.assertEqual(module.feedback_filename({"stage": "annotation"}), "annotations.json")


if __name__ == "__main__":
    unittest.main()
