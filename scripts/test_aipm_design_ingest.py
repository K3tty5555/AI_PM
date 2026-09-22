#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import unittest.mock

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "aipm_design_ingest.py"

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
        self.assertEqual(node["text"], "确认")
        self.assertEqual(self.structure["texts"], ["确认"])

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
        self.assertIn("确认", self.html)

    def test_image_fill_uses_local_asset_path(self):
        self.assertIn("url('assets/paint_img.png')", self.html)
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


if __name__ == "__main__":
    unittest.main()
