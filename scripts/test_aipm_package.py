#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打包器单元测试。"""
from __future__ import annotations

import importlib.util
import io
import json
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


def _init_repo(path: Path) -> None:
    """在临时目录里建一个最小 git 仓（不碰主仓、不联网）。

    core.hooksPath 指到 /dev/null：本机若有全局 hook 也不会干扰。
    """
    for cmd in (
        ["git", "-c", "core.hooksPath=/dev/null", "-c", "init.defaultBranch=main", "init", "-q", str(path)],
        ["git", "-C", str(path), "-c", "core.hooksPath=/dev/null", "add", "-A"],
    ):
        subprocess.run(cmd, check=True, capture_output=True, text=True)


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


class TestKindValidation(unittest.TestCase):
    def test_invalid_kind_raises(self):
        """拼错的 kind 必须炸，不能静默降级成 public。"""
        for bad in ("PRIVATE", "pubic", "", None, "public "):
            with self.assertRaises(ValueError, msg=f"kind={bad!r} 未被拒绝"):
                module.collect_files(ROOT, bad)

    def test_public_is_exactly_public(self):
        files = module.collect_files(ROOT, "public")
        self.assertNotIn("scripts/.metrics-dict.md", files)


class TestSafetyLine(unittest.TestCase):
    def test_blocked_path_raises_systemexit(self):
        """隔离仓里造一条危险 tracked 路径，安全线必须真的抛 SystemExit。

        主仓的 .gitignore 已把危险路径全挡住，所以拿主仓测这个分支等于测空集合。
        """
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            (repo / "CLAUDE.md").write_text("ok\n", encoding="utf-8")
            leak = repo / "output" / "projects" / "leak.md"
            leak.parent.mkdir(parents=True)
            leak.write_text("secret\n", encoding="utf-8")
            _init_repo(repo)
            self.assertIn("output/projects/leak.md", module._git_tracked(repo))
            with self.assertRaises(SystemExit) as ctx:
                module.collect_files(repo, "public")
            self.assertIn("output/projects/leak.md", str(ctx.exception))


class TestSymlinkExclusion(unittest.TestCase):
    def test_symlink_excluded_and_count_matches(self):
        """tracked 符号链接不进包，file_count 必须等于 tar 里的 tree 条目数。"""
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            (repo / "real.md").write_text("real\n", encoding="utf-8")
            (repo / "link.md").symlink_to("real.md")
            _init_repo(repo)

            self.assertIn("link.md", module._git_tracked(repo), "前置条件：git 应列出该符号链接")
            files = module.collect_files(repo, "public")
            self.assertEqual(files, ["real.md"], f"符号链接混入清单：{files}")

            out = module.build_package(repo, "public", repo / "dist", version="v0-test")
            with tarfile.open(out) as tf:
                tree = [n for n in tf.getnames() if n.startswith("tree/")]
                meta = json.loads(tf.extractfile("meta/versions.json").read().decode("utf-8"))
            self.assertEqual([n for n in tree], ["tree/real.md"])
            self.assertEqual(meta["file_count"], len(tree), "file_count 与实际 tar 条目数不符")


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


class TestVerify(unittest.TestCase):
    def _verify_module(self):
        p = ROOT / "scripts" / "aipm_package_verify.py"
        s = importlib.util.spec_from_file_location("aipm_package_verify", p)
        m = importlib.util.module_from_spec(s)
        assert s.loader
        s.loader.exec_module(m)
        return m

    @staticmethod
    def _tar_with(path: Path, names: list[str], kind: str = "public") -> Path:
        """造一个包；meta/versions.json 写合法 JSON，否则校验器会（正确地）报读不出。"""
        with tarfile.open(path, "w:gz") as tf:
            for n in names:
                if n.endswith("meta/versions.json"):
                    data = json.dumps({"version": "v-test", "kind": kind}).encode("utf-8")
                else:
                    data = b"x"
                info = tarfile.TarInfo(n)
                info.size = len(data)
                tf.addfile(info, io.BytesIO(data))
        return path

    def test_clean_package_passes(self):
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "public", Path(d), version="v-test")
            problems = v.verify(out, "public")
        self.assertEqual(problems, [], f"干净包被误报：{problems}")

    def test_clean_private_package_passes(self):
        """私有包同理：误杀私有包 = 校验器不可用。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "private", Path(d), version="v-test")
            problems = v.verify(out, "private")
        self.assertEqual(problems, [], f"干净私有包被误报：{problems}")

    def test_detects_sensitive_path(self):
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "bad.tar.gz"
            with tarfile.open(bad, "w:gz") as tf:
                info = tarfile.TarInfo("tree/.ai-shared/conversations/raw/x.jsonl")
                data = b"secret"
                info.size = len(data)
                tf.addfile(info, io.BytesIO(data))
            problems = v.verify(bad, "public")
        self.assertTrue(any("conversations" in p for p in problems), problems)

    def test_detects_missing_meta(self):
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "bad.tar.gz"
            with tarfile.open(bad, "w:gz") as tf:
                info = tarfile.TarInfo("tree/CLAUDE.md")
                info.size = 1
                tf.addfile(info, io.BytesIO(b"x"))
            problems = v.verify(bad, "public")
        self.assertTrue(any("meta" in p for p in problems), problems)

    def test_detects_each_forbidden_rule(self):
        """每条禁止规则都要真的会响，别留摆设。"""
        v = self._verify_module()
        for frag in v.FORBIDDEN:
            with tempfile.TemporaryDirectory() as d:
                bad = self._tar_with(Path(d) / "bad.tar.gz", [
                    "meta/versions.json", "meta/changelog.md",
                    "tree/CLAUDE.md", f"tree/{frag}x",
                ])
                problems = v.verify(bad, "public")
            self.assertTrue(problems, f"禁止路径 {frag} 未被识别")

    def test_legit_assets_not_flagged(self):
        """回归：Task 4 实测踩过的三类误杀，逐条钉住。"""
        v = self._verify_module()
        legit = [
            "tree/templates/prd-styles/default/style-config.json",
            "tree/tsconfig.json",
            "tree/output/assets/AI_PM知识库蒸馏-20260902/content-full/docs/01.md",
            "tree/vendor/foo/.DS_Store",
            "tree/scripts/ai-sync/snapshot-claude-conversations.sh",
            "tree/scripts/ai-sync/snapshot-codex-conversations.sh",
        ]
        with tempfile.TemporaryDirectory() as d:
            tar = self._tar_with(Path(d) / "ok.tar.gz",
                                 ["meta/versions.json", "meta/changelog.md"] + legit)
            problems = v.verify(tar, "public")
        self.assertEqual(problems, [], f"合法资产被误杀：{problems}")

    def test_ds_store_is_warn_only(self):
        """噪声项只提示、不进退出码。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            tar = self._tar_with(Path(d) / "n.tar.gz", [
                "meta/versions.json", "meta/changelog.md",
                "tree/CLAUDE.md", "tree/vendor/x/.DS_Store",
            ])
            self.assertEqual(v.verify(tar, "public"), [], ".DS_Store 不该计入退出码")
            self.assertTrue(v.collect_warnings(tar), ".DS_Store 应给出提示")

    def test_detects_root_docs_dir(self):
        """tree/docs/ 只拦仓库根 docs/。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            bad = self._tar_with(Path(d) / "bad.tar.gz", [
                "meta/versions.json", "meta/changelog.md",
                "tree/CLAUDE.md", "tree/docs/internal/secret.md",
            ])
            self.assertTrue(v.verify(bad, "public"))

    def test_detects_oversize(self):
        """体积上界要真的会响（造一个声明超过阈值的包）。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            tar = self._tar_with(Path(d) / "big.tar.gz",
                                 ["meta/versions.json", "meta/changelog.md", "tree/CLAUDE.md"])
            orig = v.MAX_MB
            v.MAX_MB = {"public": 0.0000001}
            try:
                problems = v.verify(tar, "public")
            finally:
                v.MAX_MB = orig
            self.assertTrue(any("体积" in p for p in problems), problems)

    def test_meta_kind_mismatch_flagged(self):
        """私有包被当成公共包校验必须报警。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "private", Path(d), version="v-test")
            problems = v.verify(out, "public")
            self.assertTrue(any("kind" in p for p in problems), problems)
            self.assertEqual(v.verify(out, "private"), [])

    def test_main_exit_code(self):
        """CLI 退出码契约：0=通过，1=有问题；警告不影响退出码。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "public", Path(d), version="v-test")
            self.assertEqual(v.main([str(out), "--kind", "public"]), 0)
            bad = self._tar_with(Path(d) / "bad.tar.gz", [
                "meta/versions.json", "meta/changelog.md",
                "tree/.ai-shared/conversations/raw/x.jsonl",
            ])
            self.assertEqual(v.main([str(bad), "--kind", "public"]), 1)


if __name__ == "__main__":
    unittest.main()
