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


if __name__ == "__main__":
    unittest.main()
