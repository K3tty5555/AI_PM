#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import copy
import importlib.util
import json
import re
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "aipm_prototype_collab.py"
SPEC_PATH = ROOT / "tests" / "fixtures" / "prototype-collab" / "prototype-spec.json"

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

    def test_lowfi_preserves_reviewable_desktop_proportions(self):
        rendered = module.render_lowfi(self.spec)
        self.assertIn(".gallery{grid-template-columns:minmax(0,1fr)", rendered)
        self.assertIn("grid-template-columns:minmax(0,1fr) 240px", rendered)
        self.assertIn("aspect-ratio:16/9", rendered)
        self.assertIn("@media(max-width:1120px)", rendered)
        self.assertIn(".frame-review{position:sticky", rendered)

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

    def test_review_accepts_skipped_gate_only_with_reason_and_opt_in(self):
        """确认门被有意跳过时，render-review 必须显式 opt-in 才渲染；
        缺 skip_reason 或没 opt-in 一律拒绝——防止把 skipped 改写成 approved 来骗过闸。"""
        base = {"spec_hash": module.content_hash(self.spec), "decision": "skipped"}
        # 没 opt-in：拒
        with self.assertRaises(module.SpecError):
            module.render_review(self.spec, "../index.html", "abc123", dict(base, skip_reason="有理由"))
        # opt-in 但没写理由：拒
        with self.assertRaises(module.SpecError):
            module.render_review(self.spec, "../index.html", "abc123", base, allow_skipped=True)
        # opt-in + 有理由：过
        rendered = module.render_review(
            self.spec, "../index.html", "abc123",
            dict(base, skip_reason="用户明确要求跳过，精细原型已先行产出"),
            allow_skipped=True,
        )
        self.assertIn("aipm-frames", rendered)
        # spec 变了，跳过也不能放行
        stale = copy.deepcopy(self.spec)
        stale["title"] = "changed"
        with self.assertRaises(module.SpecError):
            module.render_review(stale, "../index.html", "abc123",
                                 dict(base, skip_reason="x"), allow_skipped=True)

    def test_standing_decisions_surfaces_cross_version_constraints(self):
        """跨版本长期有效的约束必须被捞出来——含历史版本目录里的巡检评论。
        2026-09-20 实证：V6 巡检里「左实体列表/中试卷切图/右设置批改参数」被漏读，
        导致 V7 把已确认的三栏做成两栏。"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "feedback").mkdir(parents=True)
            (root / "feedback" / "lowfi-approval.json").write_text(json.dumps({
                "stage": "lowfi", "decision": "approved",
                "confirmation_source": "用户要求改为左实体列表、中试卷切图、右设置批改参数",
            }), encoding="utf-8")
            old = root / "历史版本" / "协作" / "V6" / "feedback"
            old.mkdir(parents=True)
            (old / "review-feedback.json").write_text(json.dumps({
                "items": [{"page_id": "solution", "state_id": "sci",
                           "feedback_type": "review-comment", "comment": "布局有问题，应该是三栏"}]
            }), encoding="utf-8")
            # 非 feedback 目录下的同名噪音文件不应混入
            (root / "visual-tokens.json").write_text(json.dumps({"note": "不该被当成结论"}), encoding="utf-8")

            found = module.collect_standing_decisions(root)
            texts = [d["text"] for d in found]
            self.assertTrue(any("中试卷切图" in t for t in texts), "当前版本的确认结论漏了")
            self.assertTrue(any("布局有问题" in t for t in texts), "历史版本目录里的巡检结论漏了")
            self.assertFalse(any("不该被当成结论" in t for t in texts), "非 feedback 文件被误收")
            scopes = [d["scope"] for d in found if "布局有问题" in d["text"]]
            self.assertEqual(scopes, ["solution::sci"], "结论没带上页面/状态归属")

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

    def test_shared_theme_does_not_mutate_spec_or_approval(self):
        before = copy.deepcopy(self.spec)
        approval = {"spec_hash": module.content_hash(self.spec), "decision": "approved"}
        for accent in ("#000000", "#923911"):
            tokens = {**module.load_visual_tokens(), "accent": accent}
            module.render_lowfi(self.spec, tokens)
            module.render_review(self.spec, "../index.html", "abc123", approval, tokens)
            self.assertEqual(self.spec, before)
            self.assertEqual(module.verify_approval(self.spec, approval), "approved")

    def test_runtime_theme_change_only_changes_instrumentation_reference(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            product = root / "index.html"
            runtime = root / "runtime.js"
            original = '<html><head><style>body{color:#aabbcc}</style></head><body><button data-aipm-id="save">保存</button></body></html>'
            product.write_text(original, encoding="utf-8")
            for color in ("#000000", "#923911"):
                module.write_text(runtime, module.annotation_runtime({**module.load_visual_tokens(), "accent": color}))
                module.instrument_html(self.spec, product, runtime)
                without_runtime = re.sub(r'<script\b[^>]*data-aipm-annotation-runtime="1"[^>]*></script>\n?', "", product.read_text(encoding="utf-8"))
                self.assertEqual(without_runtime, original)
            emitted = runtime.read_text(encoding="utf-8")
            self.assertIn(':host{--aipm-', emitted)
            self.assertNotIn(':root{', emitted)
            self.assertNotIn('AIPM_ANNOTATION_STYLE', emitted)

    def test_lowfi_does_not_link_to_unbuilt_review(self):
        self.assertNotIn('href="../review/index.html"', module.render_lowfi(self.spec))
        self.assertIn('href="../review/index.html"', module.render_lowfi(self.spec, review_ready=True))

    def test_packaged_defaults_match_emitted_tokens(self):
        self.assertEqual(module.load_visual_tokens(), module.DEFAULT_VISUAL_TOKENS)

    def test_third_stage_navigation_requires_generated_matching_spec(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            out = root / "lowfi" / "index.html"
            visual = root / "visual" / "index.html"
            self.assertFalse(module.generated_stage_ready(out, "visual", self.spec))
            module.write_text(visual, '<body data-spec-hash="stale"></body>')
            self.assertFalse(module.generated_stage_ready(out, "visual", self.spec))
            module.write_text(visual, f'<body data-spec-hash="{module.content_hash(self.spec)}"></body>')
            self.assertTrue(module.generated_stage_ready(out, "visual", self.spec))
            self.assertIn('href="../visual/index.html"', module.render_lowfi(self.spec, visual_ready=True))
            self.assertNotIn('href="../visual/index.html"', module.render_lowfi(self.spec))

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
        self.assertIn('id="syncState"', runtime)
        self.assertIn("project-or-spec-mismatch", runtime)
        self.assertIn("同步失败，可重试或导出", runtime)
        self.assertIn("knownFrames.has", runtime)

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

    def test_serve_routes_parallel_version_feedback_by_spec_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "prototype-spec.json").write_text(json.dumps(self.spec, ensure_ascii=False), encoding="utf-8")
            parallel = copy.deepcopy(self.spec)
            parallel["title"] = "V7 并行版本 Web 关键帧规格"
            v7 = root / "V7"
            v7.mkdir()
            (v7 / "prototype-spec.json").write_text(json.dumps(parallel, ensure_ascii=False), encoding="utf-8")
            self.assertEqual(module.resolve_feedback_dir(root, module.content_hash(parallel)), v7 / "feedback")
            self.assertEqual(module.resolve_feedback_dir(root, module.content_hash(self.spec)), root / "feedback")
            self.assertEqual(module.resolve_feedback_dir(root, "unknown-hash"), root / "feedback")

    def test_serve_root_for_parallel_version_escapes_to_shared_parent(self):
        # 并行版本画廊通过 ../../ 引用 当前版本/ 下的原型，serve root 必须同时包住两者
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "06-prototype"
            v7_out = base / "V7" / "review" / "index.html"
            v7_out.parent.mkdir(parents=True)
            prototype = base / "当前版本" / "v7.html"
            self.assertEqual(module.serve_root_for(v7_out, prototype), base)
            self.assertEqual(module.serve_root_for(base / "review" / "index.html", base / "index.html"), base)
            self.assertEqual(module.serve_root_for(base / "lowfi" / "index.html", None), base)

    def test_review_gallery_states_offline_degradation(self):
        approval = {"spec_hash": module.content_hash(self.spec), "decision": "approved"}
        rendered = module.render_review(self.spec, "../index.html", "abc123", approval)
        self.assertIn('class="toast" id="toast"', rendered)
        self.assertIn("未连接项目服务", rendered)

    def test_lowfi_offline_toast_names_degradation(self):
        rendered = module.render_lowfi(self.spec)
        self.assertIn("未连接项目服务", rendered)

    def test_design_diff_is_skipped_when_baseline_absent(self):
        # 没有设计稿时 accept 行为一个字不变
        report = module.design_diff_section(None, None, None)
        self.assertEqual(report, [])

    def test_design_diff_reports_top_regions_as_warnings(self):
        import importlib.util
        diff_path = Path(module.__file__).resolve().parent / "aipm_png_diff.py"
        diff_spec = importlib.util.spec_from_file_location("aipm_png_diff", diff_path)
        diff_module = importlib.util.module_from_spec(diff_spec)
        diff_spec.loader.exec_module(diff_module)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            baseline = root / "base.png"
            shot = root / "shot.png"
            baseline.write_bytes(diff_module.encode_png(4, 1, bytes([0, 0, 0]) * 4))
            shot.write_bytes(diff_module.encode_png(4, 1, bytes([255, 255, 255]) * 4))
            structure = root / "s.json"
            structure.write_text(json.dumps({
                "schema_version": 1,
                "nodes": [{"id": "a", "name": "标题区", "x": 0, "y": 0, "width": 4, "height": 1, "depth": 1}],
            }), encoding="utf-8")
            warnings = module.design_diff_section(baseline, shot, structure)
            self.assertTrue(any("标题区" in line for line in warnings))
            self.assertTrue(any("1.0" in line or "100" in line for line in warnings))

    def test_design_diff_size_mismatch_becomes_warning_not_crash(self):
        import importlib.util
        diff_path = Path(module.__file__).resolve().parent / "aipm_png_diff.py"
        diff_spec = importlib.util.spec_from_file_location("aipm_png_diff", diff_path)
        diff_module = importlib.util.module_from_spec(diff_spec)
        diff_spec.loader.exec_module(diff_module)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            baseline = root / "base.png"
            shot = root / "shot.png"
            baseline.write_bytes(diff_module.encode_png(4, 1, bytes([0, 0, 0]) * 4))
            shot.write_bytes(diff_module.encode_png(8, 1, bytes([0, 0, 0]) * 8))
            structure = root / "s.json"
            structure.write_text(json.dumps({"schema_version": 1, "nodes": []}), encoding="utf-8")
            warnings = module.design_diff_section(baseline, shot, structure)
            self.assertTrue(any("尺寸不一致" in line for line in warnings))


if __name__ == "__main__":
    unittest.main()
