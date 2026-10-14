#!/usr/bin/env python3
"""口令模式下标注路由不能带口令：否则 routeMap 命中失败（标注挂错页），口令还会写进标注 route 字段。"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "templates" / "prototype-collab" / "annotation-runtime.js"


def apply_route_source() -> str:
    text = RUNTIME.read_text(encoding="utf-8")
    match = re.search(r"  function applyRoute\(\) \{\n.*?\n  \}\n", text, re.S)
    assert match, "找不到 applyRoute()"
    return match.group(0)


@unittest.skipUnless(shutil.which("node"), "需要 node")
class AnnotationRouteTests(unittest.TestCase):
    def run_route(self, search: str, hash_: str = "") -> dict:
        harness = (
            "let pageId, stateId, frame, route;\n"
            f"const routeMap = {json.dumps({'?view=list': {'page_id': 'list', 'state_id': 'empty'}})};\n"
            f"const location = {{search: {json.dumps(search)}, hash: {json.dumps(hash_)}, pathname: '/demo/b/index.html'}};\n"
            "const document = {body: {dataset: {}}};\n"
            + apply_route_source()
            + "applyRoute();\nconsole.log(JSON.stringify({pageId, stateId, route}));\n"
        )
        result = subprocess.run(["node", "-e", harness], capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def test_token_does_not_break_route_map(self):
        out = self.run_route("?view=list&aipm_write_token=secret123")
        self.assertEqual((out["pageId"], out["stateId"]), ("list", "empty"))
        self.assertNotIn("secret123", out["route"])

    def test_plain_route_unchanged(self):
        self.assertEqual(self.run_route("?view=list")["route"], "/demo/b/index.html?view=list")


if __name__ == "__main__":
    unittest.main()
