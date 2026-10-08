#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打包器单元测试。"""
from __future__ import annotations

import importlib.util
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "aipm_package.py"
_spec = importlib.util.spec_from_file_location("aipm_package", MODULE_PATH)
module = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(module)


class TestCollect(unittest.TestCase):
    def test_public_includes_tracked_only(self):
        files = module.collect_files(ROOT, "public")
        self.assertIn("CLAUDE.md", files)
        self.assertIn(".claude/skills/ai-pm/SKILL.md", files)

    def test_public_excludes_conversations(self):
        """回归：未追踪的对话记录绝不能进包。"""
        files = module.collect_files(ROOT, "public")
        bad = [f for f in files if ".ai-shared/conversations" in f]
        self.assertEqual(bad, [], f"对话记录混入公共包：{bad[:3]}")

    def test_public_excludes_output(self):
        files = module.collect_files(ROOT, "public")
        bad = [f for f in files if f.startswith("output/")]
        self.assertEqual(bad, [], f"output/ 混入公共包：{bad[:3]}")

    def test_private_adds_private_skills(self):
        pub = set(module.collect_files(ROOT, "public"))
        pri = set(module.collect_files(ROOT, "private"))
        self.assertTrue(pub.issubset(pri), "私有版必须包含公共版全部文件")
        self.assertGreater(len(pri), len(pub))


class TestBuild(unittest.TestCase):
    def test_tar_contains_meta(self):
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "public", Path(d), version="v0.6.0-test")
            self.assertTrue(out.exists())
            with tarfile.open(out) as tf:
                names = tf.getnames()
            self.assertTrue(any(n.endswith("meta/versions.json") for n in names))
            self.assertTrue(any(n.endswith("meta/changelog.md") for n in names))

    def test_tar_excludes_conversations(self):
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "public", Path(d), version="v0.6.0-test")
            with tarfile.open(out) as tf:
                names = tf.getnames()
            # 断言钉在真正的危险源——对话记录数据目录，而不是名字里带
            # "conversations" 的任何路径：scripts/ai-sync/snapshot-*-conversations.sh
            # 是产出这些记录的同步工具（794 B 脚本），本来就该随仓库分发。
            bad = [n for n in names if ".ai-shared/conversations" in n]
            self.assertEqual(bad, [], f"对话记录进了包：{bad[:3]}")


if __name__ == "__main__":
    unittest.main()
