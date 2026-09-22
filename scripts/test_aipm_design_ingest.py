#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import unittest.mock

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "aipm_design_ingest.py"
CHECK_SCRIPT = ROOT / "scripts" / "ai-sync" / "check-visual-anchor-package.js"

_spec = importlib.util.spec_from_file_location("aipm_design_ingest", MODULE_PATH)
module = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(module)


class ParseUrlTests(unittest.TestCase):
    def test_extracts_file_id_and_decoded_layer_id(self):
        url = "https://example.test/file/1818789?page_id=1336%3A92068&layer_id=1336%3A92937"
        file_id, layers = module.parse_design_url(url)
        self.assertEqual(file_id, "1818789")
        self.assertEqual(layers, ["1336:92937"])

    def test_composite_layer_id_is_preserved_not_truncated(self):
        # 复合路径是有效 layerId，截断会切掉组件实例内部
        url = "https://example.test/file/9/?layer_id=1336%3A93031%2F16%3A05920"
        _, layers = module.parse_design_url(url)
        self.assertEqual(layers, ["1336:93031/16:05920"])

    def test_multiple_layer_ids_are_collected(self):
        url = "https://example.test/file/9?layer_id=1%3A2&layer_id=3%3A4"
        _, layers = module.parse_design_url(url)
        self.assertEqual(layers, ["1:2", "3:4"])

    def test_page_id_alone_is_rejected(self):
        url = "https://example.test/file/9?page_id=1336%3A92068"
        with self.assertRaises(module.DesignIngestError) as ctx:
            module.parse_design_url(url)
        self.assertIn("layer_id", str(ctx.exception))

    def test_missing_file_id_is_rejected(self):
        with self.assertRaises(module.DesignIngestError):
            module.parse_design_url("https://example.test/?layer_id=1%3A2")


class ResolveConfigTests(unittest.TestCase):
    def setUp(self):
        patcher = unittest.mock.patch.dict(os.environ, {}, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_reads_base_url_and_token_from_config_file(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "config.json"
            path.write_text(json.dumps({
                "mastergo_api_key": "mg_fixture",
                "mastergo_base_url": "https://example.test",
            }), encoding="utf-8")
            cfg = module.resolve_config(config_path=path)
            self.assertEqual(cfg["token"], "mg_fixture")
            self.assertEqual(cfg["base_url"], "https://example.test")

    def test_explicit_arguments_win_over_config_file(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "config.json"
            path.write_text(json.dumps({
                "mastergo_api_key": "mg_file",
                "mastergo_base_url": "https://file.test",
            }), encoding="utf-8")
            cfg = module.resolve_config(base_url="https://arg.test", token="mg_arg", config_path=path)
            self.assertEqual(cfg, {"base_url": "https://arg.test", "token": "mg_arg"})

    def test_missing_base_url_raises_with_instructions(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "absent.json"
            with self.assertRaises(module.DesignIngestError) as ctx:
                module.resolve_config(config_path=path)
            message = str(ctx.exception)
            self.assertIn("MASTERGO_BASE_URL", message)
            self.assertIn(".d2c/config.json", message)

    def test_trailing_slash_in_base_url_is_normalised(self):
        cfg = module.resolve_config(base_url="https://example.test/", token="mg_x")
        self.assertEqual(cfg["base_url"], "https://example.test")

    def test_missing_token_raises_with_instructions(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "absent.json"
            with self.assertRaises(module.DesignIngestError) as ctx:
                module.resolve_config(base_url="https://example.test", config_path=path)
            message = str(ctx.exception)
            self.assertIn("MASTERGO_TOKEN", message)
            self.assertIn(".d2c/config.json", message)

    def test_malformed_config_json_raises(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "config.json"
            path.write_text("{not valid json", encoding="utf-8")
            with self.assertRaises(module.DesignIngestError) as ctx:
                module.resolve_config(config_path=path)
            self.assertIn(str(path), str(ctx.exception))


class FetchLayerTests(unittest.TestCase):
    def test_calls_both_endpoints_with_auth_header(self):
        calls = []

        def fake_opener(request):
            calls.append((request.full_url, dict(request.header_items())))
            if "/mcp/dsl" in request.full_url:
                return json.dumps({"styles": {}, "nodes": [], "components": []}).encode()
            return json.dumps([{"id": "1:1", "cssCode": "", "children": []}]).encode()

        cfg = {"base_url": "https://example.test", "token": "mg_fixture"}
        result = module.fetch_layer(cfg, "9", "1:2", opener=fake_opener)

        self.assertEqual(len(calls), 2)
        self.assertIn("/mcp/dsl?fileId=9&layerId=1%3A2", calls[0][0])
        self.assertIn("/mcp/style?fileId=9&layerId=1%3A2", calls[1][0])
        # urllib 把 header 名首字母大写，比较时统一小写
        headers = {k.lower(): v for k, v in calls[0][1].items()}
        self.assertEqual(headers["x-mg-useraccesstoken"], "mg_fixture")
        self.assertEqual(result["dsl"]["nodes"], [])
        self.assertEqual(result["css"][0]["id"], "1:1")

    def test_empty_dsl_nodes_raises_page_id_hint(self):
        def fake_opener(request):
            if "/mcp/dsl" in request.full_url:
                return json.dumps({"styles": {}, "nodes": [], "components": []}).encode()
            return b"[]"

        cfg = {"base_url": "https://example.test", "token": "mg_x"}
        with self.assertRaises(module.DesignIngestError) as ctx:
            module.fetch_layer(cfg, "9", "1:2", opener=fake_opener, require_nodes=True)
        self.assertIn("画板", str(ctx.exception))

    def test_composite_layer_id_survives_into_request_url(self):
        calls = []

        def fake_opener(request):
            calls.append(request.full_url)
            if "/mcp/dsl" in request.full_url:
                return json.dumps({"styles": {}, "nodes": [], "components": []}).encode()
            return b"[]"

        cfg = {"base_url": "https://example.test", "token": "mg_x"}
        module.fetch_layer(cfg, "9", "1336:93031/16:05920", opener=fake_opener)

        self.assertIn("layerId=1336%3A93031%2F16%3A05920", calls[0])
        self.assertIn("layerId=1336%3A93031%2F16%3A05920", calls[1])

    def test_api_error_code_raises_design_ingest_error(self):
        def fake_opener(request):
            if "/mcp/dsl" in request.full_url:
                return json.dumps({
                    "code": "10005",
                    "message": "❌ 获取layer数据失败, 参数错误",
                }).encode()
            return b"[]"

        cfg = {"base_url": "https://example.test", "token": "mg_x"}
        with self.assertRaises(module.DesignIngestError) as ctx:
            module.fetch_layer(cfg, "9", "1:2", opener=fake_opener)
        self.assertIn("10005", str(ctx.exception))

    def test_non_json_response_raises_with_prefix(self):
        def fake_opener(request):
            return b"<!DOCTYPE html><html><body>Bad Gateway</body></html>"

        cfg = {"base_url": "https://example.test", "token": "mg_x"}
        with self.assertRaises(module.DesignIngestError) as ctx:
            module.fetch_layer(cfg, "9", "1:2", opener=fake_opener)
        self.assertIn("<!DOCTYPE html", str(ctx.exception))


FIXTURES = ROOT / "tests" / "fixtures" / "design-ingest"


def load_fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def fixture_opener(calls=None):
    """dsl/css 端点回固定 fixture；其余 URL（素材下载）回一段 PNG 字节。"""
    dsl = load_fixture("dsl-sample.json")
    css = load_fixture("css-sample.json")

    def opener(request):
        if calls is not None:
            calls.append(request.full_url)
        if "/mcp/dsl" in request.full_url:
            return json.dumps(dsl).encode()
        if "/mcp/style" in request.full_url:
            return json.dumps(css).encode()
        return b"\x89PNG\r\n\x1a\nfixture"

    return opener


class StructureTests(unittest.TestCase):
    def setUp(self):
        self.dsl = load_fixture("dsl-sample.json")
        self.css = load_fixture("css-sample.json")
        self.structure = module.build_structure(self.dsl, self.css, "1:1")

    def test_canvas_comes_from_root_layout_style(self):
        self.assertEqual(self.structure["canvas"], {"width": 400, "height": 300})

    def test_every_node_is_flattened(self):
        ids = [node["id"] for node in self.structure["nodes"]]
        self.assertEqual(ids, ["1:1", "1:2", "1:3", "1:4", "1:5"])

    def test_coordinates_are_accumulated_to_absolute(self):
        # 1:4 相对 1:3 是 (12,5)，1:3 相对根是 (20,40)，绝对应为 (32,45)
        text_node = next(n for n in self.structure["nodes"] if n["id"] == "1:4")
        self.assertEqual((text_node["x"], text_node["y"]), (32.0, 45.0))

    def test_css_code_is_attached_by_id(self):
        node = next(n for n in self.structure["nodes"] if n["id"] == "1:3")
        self.assertIn("border-radius: 4px", node["css"])

    def test_width_height_come_from_dsl_not_css(self):
        # /mcp/style 实测 294/294 都没有宽高，宽高只能取 dsl
        node = next(n for n in self.structure["nodes"] if n["id"] == "1:3")
        self.assertEqual((node["width"], node["height"]), (80.0, 32.0))

    def test_instance_variant_comes_from_component_info_not_name(self):
        # name 是变体串，靠 name 认组件会全错
        node = next(n for n in self.structure["nodes"] if n["id"] == "1:3")
        self.assertEqual(node["variant"], {"state": "enable", "size": "m"})
        self.assertEqual(node["component_id"], "9:1")

    def test_text_runs_are_joined(self):
        node = next(n for n in self.structure["nodes"] if n["id"] == "1:4")
        self.assertEqual(node["text"], "确认 <OK>")
        self.assertEqual(self.structure["texts"], ["确认 <OK>"])

    def test_navigation_is_collected_with_variant(self):
        self.assertEqual(self.structure["navigations"], [
            {"from_id": "1:3", "to_layer_id": "9:7", "variant": {"state": "enable", "size": "m"}}
        ])

    def test_empty_vector_path_is_marked_as_icon_placeholder(self):
        node = next(n for n in self.structure["nodes"] if n["id"] == "1:5")
        self.assertTrue(node["icon_placeholder"])
        self.assertEqual(node["name"], "解释说明-疑问")

    def test_css_index_ignores_nesting(self):
        index = module.index_css(self.css)
        self.assertEqual(set(index), {"1:1", "1:2", "1:3", "1:4", "1:5"})

    def test_remote_url_in_css_code_is_stripped_from_structure(self):
        # 签名图链可能藏在 cssCode 里；structures/ 也是持久化产物，
        # 除 raw/（逐字快照）外一律不落盘
        node = next(n for n in self.structure["nodes"] if n["id"] == "1:2")
        self.assertNotIn("expire=", node["css"])
        self.assertNotIn("https://", node["css"])


class SlugTests(unittest.TestCase):
    def test_chinese_name_falls_back_to_layer_id(self):
        self.assertEqual(module.slugify_page_id("入口页", "1336:92937"), "1336-92937")

    def test_ascii_name_is_slugified(self):
        self.assertEqual(module.slugify_page_id("Entry Page", "1:2"), "entry-page")

    def test_blank_name_falls_back_to_layer_id(self):
        self.assertEqual(module.slugify_page_id("   ", "1:2"), "1-2")


class TokenTests(unittest.TestCase):
    def setUp(self):
        self.tokens = module.extract_tokens(load_fixture("dsl-sample.json")["styles"])

    def test_same_color_value_merges_into_one_alias_group(self):
        # 实测一个产品里同一品牌色有新旧两套命名，二选一会丢可读性
        black = next(c for c in self.tokens["colors"] if c["value"] == "#0A0B0C")
        self.assertEqual(sorted(black["names"]), sorted(["sys-color/text/text-primary", "旧色板/--color-text"]))

    def test_distinct_colors_stay_separate(self):
        values = sorted(c["value"] for c in self.tokens["colors"])
        self.assertEqual(values, ["#0A0B0C", "#FFFFFF"])

    def test_typography_is_extracted_with_name(self):
        body = self.tokens["typography"][0]
        self.assertEqual(body["family"], "Demo Sans")
        self.assertEqual(body["size"], 14)
        self.assertEqual(body["names"], ["body/body-m"])

    def test_effect_with_empty_value_is_dropped(self):
        self.assertEqual(len(self.tokens["effects"]), 1)
        self.assertIn("box-shadow", self.tokens["effects"][0]["value"])

    def test_image_paints_are_listed_with_url(self):
        self.assertEqual(self.tokens["images"], [
            {"style_id": "paint_img", "url": "https://example.test/pic.png?expire=1"}
        ])

    def test_unnamed_color_still_recorded_with_empty_names(self):
        tokens = module.extract_tokens({"paint_x": {"value": ["#123456"]}})
        self.assertEqual(tokens["colors"], [{"value": "#123456", "names": []}])

    def test_colors_are_sorted_for_deterministic_output(self):
        tokens = module.extract_tokens({
            "paint_1": {"value": ["#FFFFFF"]},
            "paint_2": {"value": ["#000000"]},
        })
        self.assertEqual([c["value"] for c in tokens["colors"]], ["#000000", "#FFFFFF"])


class MergeTokenSetsTests(unittest.TestCase):
    def test_alias_groups_merge_across_pages(self):
        a = {"schema_version": 1, "colors": [{"value": "#05C1AE", "names": ["brand/primary"]}],
             "typography": [], "effects": [], "images": []}
        b = {"schema_version": 1, "colors": [{"value": "#05C1AE", "names": ["主色/常规"]}],
             "typography": [], "effects": [], "images": []}
        merged = module.merge_token_sets([a, b])
        self.assertEqual(merged["colors"], [
            {"value": "#05C1AE", "names": ["brand/primary", "主色/常规"]}
        ])

    def test_merging_empty_list_yields_empty_sections(self):
        merged = module.merge_token_sets([])
        self.assertEqual(merged["colors"], [])
        self.assertEqual(merged["schema_version"], 1)


class RenderTests(unittest.TestCase):
    def setUp(self):
        dsl = load_fixture("dsl-sample.json")
        css = load_fixture("css-sample.json")
        self.structure = module.build_structure(dsl, css, "1:1")
        self.tokens = module.extract_tokens(dsl["styles"])
        self.html = module.render_html(self.structure, self.tokens, {"paint_img": "assets/paint_img.png"})

    def test_stage_uses_canvas_size(self):
        self.assertIn("width:400px", self.html)
        self.assertIn("height:300px", self.html)

    def test_every_node_becomes_a_positioned_div(self):
        for node_id in ("1:1", "1:2", "1:3", "1:4", "1:5"):
            self.assertIn(f'data-id="{node_id}"', self.html)
        self.assertEqual(self.html.count("position:absolute"), 5)

    def test_absolute_coordinates_are_used_not_relative(self):
        # 1:4 绝对坐标 (32,45)，不是 DSL 里的相对 (12,5)
        self.assertIn("left:32px;top:45px", self.html)

    def test_text_content_is_escaped_and_present(self):
        # fixture 文本带 <OK>，转义必须真的发生：原始尖括号不进 HTML
        self.assertIn("确认 &lt;OK&gt;", self.html)
        self.assertNotIn("<OK>", self.html)

    def test_quoted_font_family_survives_attribute_escaping(self):
        # cssCode 里的引号字体会打断双引号 style 属性，转义后必须还能解析回原声明
        from html.parser import HTMLParser

        captured = {}

        class DivGrabber(HTMLParser):
            def handle_starttag(self, tag, attrs):
                if tag == "div":
                    attrs_dict = dict(attrs)
                    if attrs_dict.get("data-id") == "1:4":
                        captured["style"] = attrs_dict.get("style")

        self.assertIn("font-family: &quot;Demo Sans&quot;", self.html)
        DivGrabber().feed(self.html)
        # 属性值经 HTMLParser 反转义后必须还原成原始声明（引号原样回来）
        self.assertIn('font-family: "Demo Sans"', captured["style"])

    def test_image_fill_uses_local_asset_path(self):
        self.assertIn("url('assets/paint_img.png')", self.html)
        # fixture 的 cssCode（节点 1:2）里也埋了同一个签名 URL，两条路都不许漏出去
        self.assertNotIn("https://example.test/pic.png", self.html)

    def test_icon_placeholder_carries_semantic_name(self):
        self.assertIn('data-icon="解释说明-疑问"', self.html)

    def test_effect_shadow_is_applied(self):
        self.assertIn("box-shadow: 0px 2px 6px 0px rgba(0, 0, 0, 0.2)", self.html)

    def test_output_is_deterministic(self):
        again = module.render_html(self.structure, self.tokens, {"paint_img": "assets/paint_img.png"})
        self.assertEqual(self.html, again)

    def test_missing_asset_falls_back_to_flat_colour_not_remote_url(self):
        html_without = module.render_html(self.structure, self.tokens, {})
        self.assertNotIn("https://example.test", html_without)


class FingerprintTests(unittest.TestCase):
    def setUp(self):
        dsl = load_fixture("dsl-sample.json")
        css = load_fixture("css-sample.json")
        self.structure = module.build_structure(dsl, css, "1:1")
        self.tokens = module.extract_tokens(dsl["styles"])
        self.text = module.render_fingerprint([self.structure], self.tokens)

    def test_measured_section_is_present(self):
        self.assertIn("## 实测值", self.text)

    def test_canvas_size_is_recorded(self):
        self.assertIn("400 × 300", self.text)

    def test_colour_alias_group_is_rendered_on_one_line(self):
        self.assertIn("#0A0B0C", self.text)
        self.assertIn("sys-color/text/text-primary", self.text)
        self.assertIn("旧色板/--color-text", self.text)

    def test_source_layer_id_is_recorded(self):
        self.assertIn("1:1", self.text)

    def test_icon_placeholders_are_listed_for_substitution(self):
        self.assertIn("解释说明-疑问", self.text)

    def test_readonly_boundary_is_stated(self):
        self.assertIn("只读", self.text)

    def test_typography_line_includes_letter_spacing_when_set(self):
        # 字距是五元组的一部分，只差字距的两条规格必须在指纹里肉眼可分
        tokens = {
            "colors": [], "effects": [],
            "typography": [
                {"family": "Demo Sans", "size": 14, "weight": "400", "line_height": "22",
                 "letter_spacing": "1", "names": ["body/body-m"]},
                {"family": "Demo Sans", "size": 16, "weight": "500", "line_height": "24",
                 "letter_spacing": "auto", "names": ["title/title-m"]},
            ],
        }
        text = module.render_fingerprint([self.structure], tokens)
        self.assertIn("行高 22 字距 1", text)
        self.assertIn("行高 24 —", text)
        self.assertNotIn("字距 auto", text)


class IngestTests(unittest.TestCase):
    def test_ingest_writes_the_full_package_layout(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            result = module.ingest(
                "https://example.test/file/9?layer_id=1%3A1",
                out,
                {"base_url": "https://example.test", "token": "mg_x"},
                opener=fixture_opener(),
                runner=lambda *a, **k: True,
            )
            page_id = result["pages"][0]["page_id"]
            self.assertTrue((out / "design-tokens.json").is_file())
            self.assertTrue((out / f"structures/{page_id}.json").is_file())
            self.assertTrue((out / f"renders/{page_id}.html").is_file())
            self.assertTrue((out / f"raw/dsl-{page_id}.json").is_file())
            self.assertTrue((out / f"raw/css-{page_id}.json").is_file())
            self.assertTrue((out / "manifest.json").is_file())

    def test_manifest_marks_source_and_generator(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            module.ingest(
                "https://example.test/file/9?layer_id=1%3A1", out,
                {"base_url": "https://example.test", "token": "mg_x"},
                opener=fixture_opener(), runner=lambda *a, **k: True,
            )
            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["source"], "mastergo")
            self.assertEqual(manifest["generatedBy"], "mastergo-ingest")
            self.assertEqual(manifest["packageType"], "visual-anchor-manifest")

    def test_manifest_images_point_at_renders_not_downloaded_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            module.ingest(
                "https://example.test/file/9?layer_id=1%3A1", out,
                {"base_url": "https://example.test", "token": "mg_x"},
                opener=fixture_opener(), runner=lambda *a, **k: True,
            )
            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(len(manifest["images"]), 1)
            self.assertTrue(manifest["images"][0]["image"].startswith("images/"))

    def test_signed_urls_are_never_persisted(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            module.ingest(
                "https://example.test/file/9?layer_id=1%3A1", out,
                {"base_url": "https://example.test", "token": "mg_x"},
                opener=fixture_opener(), runner=lambda *a, **k: True,
            )
            # 唯一豁免 raw/：spec 明文「原始快照，留证据」，逐字保真是设计意图；
            # 其余产出文件（含 design-tokens.json 与二进制 assets）一律不得含签名参数
            files = [
                p for p in out.rglob("*")
                if p.is_file() and p.relative_to(out).parts[0] != "raw"
            ]
            self.assertTrue(files)
            for path in files:
                self.assertNotIn(b"expire=", path.read_bytes(), str(path))

    def test_design_tokens_images_carry_local_asset_paths_not_signed_urls(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            module.ingest(
                "https://example.test/file/9?layer_id=1%3A1", out,
                {"base_url": "https://example.test", "token": "mg_x"},
                opener=fixture_opener(), runner=lambda *a, **k: True,
            )
            tokens = json.loads((out / "design-tokens.json").read_text(encoding="utf-8"))
            self.assertEqual(tokens["images"], [
                {"style_id": "paint_img", "url": "assets/paint_img.png"}
            ])

    def test_all_screenshots_failed_marks_status_failed(self):
        # 全挂时必须降级为 failed（校验器豁免 failed 的 images 非空检查），
        # 而不是登记指向不存在 PNG 的 images[] 让整包变 invalid
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            result = module.ingest(
                "https://example.test/file/9?layer_id=1%3A1", out,
                {"base_url": "https://example.test", "token": "mg_x"},
                opener=fixture_opener(), runner=lambda *a, **k: False,
            )
            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["status"], "failed")
            self.assertEqual(manifest["images"], [])
            self.assertTrue(any("截图" in risk for risk in manifest["knownRisks"]))
            self.assertEqual(result["pages"][0]["screenshot_ok"], False)

    def test_partial_screenshot_failure_lists_only_successful_images(self):
        outcomes = [True, False]
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            module.ingest(
                "https://example.test/file/9?layer_id=1%3A1&layer_id=1%3A1", out,
                {"base_url": "https://example.test", "token": "mg_x"},
                opener=fixture_opener(),
                runner=lambda *a, **k: outcomes.pop(0),
            )
            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["status"], "partial")
            self.assertEqual([item["image"] for item in manifest["images"]], ["images/1-1.png"])
            self.assertTrue(any("截图" in risk for risk in manifest["knownRisks"]))

    def test_page_id_collision_is_disambiguated_not_overwritten(self):
        # 同名画板 / 重复 layer_id 会 slug 撞车；静默覆盖会丢前一个的全部证据
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            result = module.ingest(
                "https://example.test/file/9?layer_id=1%3A1&layer_id=1%3A1", out,
                {"base_url": "https://example.test", "token": "mg_x"},
                opener=fixture_opener(), runner=lambda *a, **k: True,
            )
            self.assertTrue((out / "structures/1-1.json").is_file())
            self.assertTrue((out / "structures/1-1-2.json").is_file())
            self.assertTrue((out / "renders/1-1.html").is_file())
            self.assertTrue((out / "renders/1-1-2.html").is_file())
            self.assertEqual([page["page_id"] for page in result["pages"]], ["1-1", "1-1-2"])
            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(
                sorted(item["image"] for item in manifest["images"]),
                ["images/1-1-2.png", "images/1-1.png"],
            )
            self.assertEqual(
                sorted(item["id"] for item in manifest["images"]),
                ["img-1-1", "img-1-1-2"],
            )

    def test_failed_asset_downloads_leave_a_known_risks_trace(self):
        inner = fixture_opener()

        def failing_asset_opener(request):
            if "pic.png" in request.full_url:
                raise OSError("download boom")
            return inner(request)

        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            module.ingest(
                "https://example.test/file/9?layer_id=1%3A1", out,
                {"base_url": "https://example.test", "token": "mg_x"},
                opener=failing_asset_opener, runner=lambda *a, **k: True,
            )
            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["status"], "ready")
            risks = "\n".join(manifest["knownRisks"])
            self.assertIn("素材下载失败", risks)
            self.assertIn("重跑 ingest 可恢复", risks)


@unittest.skipUnless(shutil.which("node"), "node 不在 PATH，跳过跨模块契约测试")
class ValidatorContractTests(unittest.TestCase):
    """ingest 的产出必须真能过校验器——两边契约不能只靠各自单元测试各自为真。"""

    def _run_validator_after_ingest(self, runner):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        # 校验器固定读 <root>/06-prototype-visual，ingest 的 out_dir 就是这个目录
        root = Path(temp.name)
        module.ingest(
            "https://example.test/file/9?layer_id=1%3A1",
            root / "06-prototype-visual",
            {"base_url": "https://example.test", "token": "mg_x"},
            opener=fixture_opener(),
            runner=runner,
        )
        return subprocess.run(
            ["node", str(CHECK_SCRIPT), str(root)], capture_output=True, text=True
        )

    def test_all_failed_package_is_accepted_by_validator_and_points_back_at_ingest(self):
        result = self._run_validator_after_ingest(runner=lambda *a, **k: False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("STATUS: failed", result.stdout)
        # T6 遗留：mastergo 降级包的下一步指回 ingest-design，不是 Codex
        self.assertIn("ingest-design", result.stdout)
        self.assertNotIn("Codex", result.stdout)

    def test_ready_package_is_accepted_by_validator(self):
        def writing_runner(html_path, png_path, width, height):
            png_path.parent.mkdir(parents=True, exist_ok=True)
            png_path.write_bytes(b"\x89PNG\r\n\x1a\nfixture")
            return True

        result = self._run_validator_after_ingest(runner=writing_runner)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("STATUS: ready", result.stdout)


class DistillTests(unittest.TestCase):
    def test_new_colour_is_reported_as_added(self):
        incoming = {"colors": [{"value": "#111111", "names": ["brand/x"]}], "typography": [], "effects": []}
        existing = {"colors": [], "typography": [], "effects": []}
        diff = module.diff_token_sets(incoming, existing)
        self.assertEqual(diff["added"], [{"kind": "color", "value": "#111111", "names": ["brand/x"]}])
        self.assertEqual(diff["conflicts"], [])

    def test_same_value_new_name_is_alias_not_conflict(self):
        incoming = {"colors": [{"value": "#05C1AE", "names": ["主色/常规"]}], "typography": [], "effects": []}
        existing = {"colors": [{"value": "#05C1AE", "names": ["brand/primary"]}], "typography": [], "effects": []}
        diff = module.diff_token_sets(incoming, existing)
        self.assertEqual(diff["conflicts"], [])
        self.assertEqual(diff["aliases"], [
            {"kind": "color", "value": "#05C1AE", "added_names": ["主色/常规"],
             "existing_names": ["brand/primary"]}
        ])

    def test_same_name_different_value_is_conflict(self):
        incoming = {"colors": [{"value": "#000000", "names": ["brand/primary"]}], "typography": [], "effects": []}
        existing = {"colors": [{"value": "#05C1AE", "names": ["brand/primary"]}], "typography": [], "effects": []}
        diff = module.diff_token_sets(incoming, existing)
        self.assertEqual(diff["conflicts"], [
            {"kind": "color", "name": "brand/primary", "incoming": "#000000", "existing": "#05C1AE"}
        ])

    def test_identical_token_produces_nothing(self):
        same = {"colors": [{"value": "#FFFFFF", "names": ["bg/primary"]}], "typography": [], "effects": []}
        diff = module.diff_token_sets(same, same)
        self.assertEqual(diff["added"], [])
        self.assertEqual(diff["aliases"], [])
        self.assertEqual(diff["conflicts"], [])

    def test_report_marks_conflicts_as_needing_a_human(self):
        diff = {"added": [], "aliases": [],
                "conflicts": [{"kind": "color", "name": "brand/primary", "incoming": "#000", "existing": "#05C1AE"}]}
        report = module.render_distill_report(diff)
        self.assertIn("brand/primary", report)
        self.assertIn("人判", report)

    def test_report_states_nothing_is_written_automatically(self):
        report = module.render_distill_report({"added": [], "aliases": [], "conflicts": []})
        self.assertIn("不自动写入", report)

    def test_same_typography_spec_new_name_is_alias_not_conflict(self):
        spec = {"family": "Demo Sans", "size": 14, "weight": 500, "line_height": 22, "letter_spacing": 0}
        incoming = {"colors": [], "typography": [dict(spec, names=["标题/中号"])], "effects": []}
        existing = {"colors": [], "typography": [dict(spec, names=["title/title-m-medium"])], "effects": []}
        diff = module.diff_token_sets(incoming, existing)
        self.assertEqual(diff["conflicts"], [])
        self.assertEqual(diff["aliases"], [
            {"kind": "typography", "value": ("Demo Sans", 14, 500, 22, 0),
             "added_names": ["标题/中号"], "existing_names": ["title/title-m-medium"]}
        ])
        report = module.render_distill_report(diff)
        self.assertIn("`Demo Sans 14px/500 行高 22`", report)
        self.assertNotIn("('Demo Sans', 14", report)

    def test_same_typography_name_different_size_is_conflict(self):
        incoming = {"colors": [], "typography": [
            {"family": "Demo Sans", "size": 16, "weight": 500, "line_height": 24,
             "letter_spacing": 0, "names": ["title/title-m-medium"]}
        ], "effects": []}
        existing = {"colors": [], "typography": [
            {"family": "Demo Sans", "size": 14, "weight": 500, "line_height": 22,
             "letter_spacing": 0, "names": ["title/title-m-medium"]}
        ], "effects": []}
        diff = module.diff_token_sets(incoming, existing)
        self.assertEqual(diff["conflicts"], [
            {"kind": "typography", "name": "title/title-m-medium",
             "incoming": ("Demo Sans", 16, 500, 24, 0),
             "existing": ("Demo Sans", 14, 500, 22, 0)}
        ])

    def test_letter_spacing_only_conflict_renders_distinct_sides(self):
        # 只差字距的两条规格是五元组层面的真冲突；报告两侧必须肉眼可分，
        # 否则人拿着退出码 2 也判不了
        base = {"family": "Demo Sans", "size": 14, "weight": 500, "line_height": 22}
        incoming = {"colors": [], "typography": [
            dict(base, letter_spacing=1, names=["body/body-m"])
        ], "effects": []}
        existing = {"colors": [], "typography": [
            dict(base, letter_spacing=0, names=["body/body-m"])
        ], "effects": []}
        diff = module.diff_token_sets(incoming, existing)
        self.assertEqual(len(diff["conflicts"]), 1)
        report = module.render_distill_report(diff)
        self.assertIn("`Demo Sans 14px/500 行高 22 字距 1`", report)
        self.assertIn("`Demo Sans 14px/500 行高 22`", report)


if __name__ == "__main__":
    unittest.main()
