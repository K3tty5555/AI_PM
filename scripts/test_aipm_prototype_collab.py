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

    def test_review_contains_real_prototype_frames(self):
        rendered = module.render_review(self.spec, "../index.html", "abc123")
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
