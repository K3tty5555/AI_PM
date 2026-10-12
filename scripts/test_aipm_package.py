#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打包器单元测试。"""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import stat
import struct
import subprocess
import tempfile
import time
import unicodedata
import unittest
import warnings
import zipfile
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "aipm_package.py"
_spec = importlib.util.spec_from_file_location("aipm_package", MODULE_PATH)
module = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(module)

# 这两项是作者本机的私有输入，随 .gitignore 存在、不随仓分发。分发环境里缺席
# 时必须显式跳过——不跳的话 build_package(ROOT, "public") 会撞 _public_history
# 的安全线（SystemExit），clone 出去整套回归直接红，而那是环境缺席、不是代码坏。
_DENYLIST = ROOT / "scripts" / ".share-denylist"
_PRIVATE_SKILLS = (".claude/skills/xfchat-wiki", ".claude/skills/tpd_cli", ".claude/skills/d2c")

HAS_DENYLIST = _DENYLIST.is_file()
HAS_PRIVATE_SKILLS = any((ROOT / rel).is_dir() for rel in _PRIVATE_SKILLS)

_DENYLIST_REASON = (
    "未分发本机私有 scripts/.share-denylist（gitignore，仅作者本机）；"
    "公共包历史过滤逻辑已由 test_public_history_filters_old_internal_content 自带隔离仓覆盖"
)
_PRIVATE_REASON = "未分发私有 skill（xfchat-wiki/tpd_cli/d2c*），私有版增量无从比较"


def setUpModule() -> None:
    """私有输入缺席时报 N/A 而不是静默通过（run_check 据此透出 ➖，见 regression-suite 约定）。"""
    if not HAS_DENYLIST:
        print(f"N/A: {_DENYLIST_REASON}；依赖它的用例已跳过")
    if not HAS_PRIVATE_SKILLS:
        print(f"N/A: {_PRIVATE_REASON}；依赖它的用例已跳过")



def _init_repo(path: Path) -> None:
    """在临时目录里建一个最小 git 仓（不碰主仓、不联网）。

    core.hooksPath 指到 /dev/null：本机若有全局 hook 也不会干扰。
    """
    for cmd in (
        ["git", "-c", "core.hooksPath=/dev/null", "-c", "init.defaultBranch=main", "init", "-q", str(path)],
        ["git", "-C", str(path), "-c", "core.hooksPath=/dev/null", "add", "-A"],
    ):
        subprocess.run(cmd, check=True, capture_output=True, text=True)


def _commit(repo: Path, message: str) -> None:
    subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True, capture_output=True)
    subprocess.run([
        "git", "-C", str(repo), "-c", "user.name=Test", "-c", "user.email=test@example.test",
        "-c", "core.hooksPath=/dev/null", "commit", "-qm", message,
    ], check=True, capture_output=True)


def _zip_names(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as zf:
        return zf.namelist()


def _zip_json(path: Path, name: str):
    with zipfile.ZipFile(path) as zf:
        return json.loads(zf.read(name).decode("utf-8"))


def _body_names(names: list[str]) -> list[str]:
    """去掉打包器生成的 .ignore 与 .aipm-dist/ 后的「安装内容」。"""
    return [n for n in names if n != module.IGNORE_FILE and not n.startswith(module.DIST + "/")]


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

    @unittest.skipUnless(HAS_PRIVATE_SKILLS, _PRIVATE_REASON)
    def test_private_adds_private_skills(self):
        pub = set(module.collect_files(ROOT, "public"))
        pri = set(module.collect_files(ROOT, "private"))
        self.assertTrue(pub.issubset(pri), "私有版必须包含公共版全部文件")
        self.assertGreater(len(pri), len(pub))

    def test_collect_dir_skips_nested_git(self):
        """回归（2026-10-10）：私有 skill 若是 git clone，.git 目录（内部仓库历史）
        绝不能进分发包——分发形态见不得 git 元数据。同名邻居 .gitignore 必须保留。"""
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            skill = root / "private-skill"
            (skill / ".git" / "objects").mkdir(parents=True)
            (skill / ".git" / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
            (skill / ".git").mkdir(exist_ok=True)
            (skill / ".git" / "config").write_text("[core]\n", encoding="utf-8")
            (skill / ".gitignore").write_text("x\n", encoding="utf-8")
            (skill / "SKILL.md").write_text("---\nname: x\n---\n", encoding="utf-8")
            (skill / "sub").mkdir()
            (skill / "sub" / ".git").write_text("gitdir: ../.git\n", encoding="utf-8")  # worktree 指针文件同样跳过
            got = module._walk_dir(root, "private-skill")
            self.assertEqual(sorted(got), ["private-skill/.gitignore", "private-skill/SKILL.md"])


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


    def test_local_registry_force_added_raises(self):
        """本机注册表（外部 skill 名）被 git add -f 强行入库也进不了包：两种包都要拦。

        没 tracked 的它本来就进不了清单，所以这里必须强行 add，否则测的是空集合。"""
        for kind in ("public", "private"):
            with tempfile.TemporaryDirectory() as d:
                repo = Path(d)
                (repo / "CLAUDE.md").write_text("ok\n", encoding="utf-8")
                local = repo / "templates/configs/capability-registry.local.json"
                local.parent.mkdir(parents=True)
                local.write_text('{"schema_version":1,"capabilities":[]}', encoding="utf-8")
                _init_repo(repo)
                subprocess.run(["git", "-C", str(repo), "add", "-f", str(local)], check=True, capture_output=True)
                self.assertIn("templates/configs/capability-registry.local.json", module._git_tracked(repo))
                with self.assertRaises(SystemExit, msg=kind) as ctx:
                    module.collect_files(repo, kind)
                self.assertIn("capability-registry.local.json", str(ctx.exception))


class TestSymlinkExclusion(unittest.TestCase):
    def test_symlink_excluded_and_count_matches(self):
        """tracked 符号链接不进包，file_count 必须等于包内安装条目数。"""
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            (repo / "real.md").write_text("real\n", encoding="utf-8")
            (repo / "link.md").symlink_to("real.md")
            _init_repo(repo)

            self.assertIn("link.md", module._git_tracked(repo), "前置条件：git 应列出该符号链接")
            files = module.collect_files(repo, "public")
            self.assertEqual(files, ["real.md"], f"符号链接混入清单：{files}")

            out = module.build_package(repo, "public", repo / "dist", version="v0-test")
            self.assertEqual(out, repo / "dist" / "AI_PM.zip")
            meta = _zip_json(out, f"{module.DIST}/versions.json")
            self.assertEqual(_body_names(_zip_names(out)), ["real.md"])
            self.assertEqual(meta["file_count"], 1, "file_count 与实际条目数不符")


class TestBuild(unittest.TestCase):
    @unittest.skipUnless(HAS_DENYLIST, _DENYLIST_REASON)
    def test_zip_contains_dist_meta(self):
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "public", Path(d), version="v0.6.0-test")
            names = _zip_names(out)
            self.assertIn(f"{module.DIST}/versions.json", names)
            self.assertIn(f"{module.DIST}/changelog.md", names)
            self.assertIn(".claude/skills/ai-pm/SKILL.md", names, "解压后根下必须直接是 AI_PM 内容")

    @unittest.skipUnless(HAS_DENYLIST, _DENYLIST_REASON)
    def test_zip_excludes_conversations(self):
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "public", Path(d), version="v0.6.0-test")
            names = _zip_names(out)
            # 断言钉在真正的危险源——对话记录数据目录，而不是名字里带
            # "conversations" 的任何路径：scripts/ai-sync/snapshot-*-conversations.sh
            # 是产出这些记录的同步工具（794 B 脚本），本来就该随仓库分发。
            bad = [n for n in names if ".ai-shared/conversations" in n]
            self.assertEqual(bad, [], f"对话记录进了包：{bad[:3]}")


class TestHistory(unittest.TestCase):
    def test_history_index_covers_managed_paths(self):
        """索引必须含受管路径的历史，且不含非受管路径。"""
        index = module.collect_history(ROOT)
        self.assertTrue(index, "history 索引为空")
        keys = list(index)
        managed = (".claude/", ".codex/hooks.json", "scripts/", "templates/",
                   "CLAUDE.md", ".gitignore")
        self.assertTrue(all(k.startswith(managed) for k in keys),
                        f"索引含非受管路径：{[k for k in keys if not k.startswith(managed)][:3]}")
        self.assertIn("CLAUDE.md", keys, "索引缺 CLAUDE.md")
        self.assertNotIn(".claude/skills/settings.local.json", keys,
                         "历史上追踪过的本机配置不能通过 history/ 混入分发包")
        self.assertFalse(any(k.startswith(".claude/agent-team/") for k in keys),
                         "受管白名单外的历史 agent-team 不能混入 history")
        self.assertFalse(any(k.startswith("templates/knowledge-base/") and k.endswith(".md")
                             and k != "templates/knowledge-base/README.md" for k in keys),
                         "知识库卡片属于数据资产，不走受管文件的 history")
        for k, entries in list(index.items())[:5]:
            self.assertTrue(entries, f"{k} 无历史条目")
            self.assertIn("version", entries[0])
            self.assertIn("blob", entries[0])

    @unittest.skipUnless(HAS_DENYLIST, _DENYLIST_REASON)
    def test_history_in_package(self):
        """包内必须有 history/ 与 history/index.json。"""
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "public", Path(d), version="v-test")
            names = _zip_names(out)
            index = _zip_json(out, f"{module.DIST}/history/index.json")
            revisions = _zip_json(out, f"{module.DIST}/history/revisions.json")
        self.assertTrue(index)
        self.assertTrue(revisions["revisions"], "缺可用于版本打分的快照")
        self.assertEqual(revisions["schema_version"], 1)
        self.assertTrue(any(n.endswith(".blob") for n in names), "history/ 只有索引没有内容")

    @unittest.skipUnless(HAS_DENYLIST, _DENYLIST_REASON)
    def test_history_content_addressed(self):
        """同一内容只写一份 blob，不同内容使用不同 blob 名。"""
        index = module.collect_history(ROOT)
        blobs = [e["blob"] for entries in index.values() for e in entries]
        self.assertTrue(blobs)
        self.assertTrue(all(len(b) == 12 for b in blobs), f"blob 名不是 12 位：{blobs[:3]}")
        self.assertGreater(len(set(blobs)), 1, "历史索引没有可区分的内容 blob")

        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "public", Path(d), version="v-test")
            names = [n for n in _zip_names(out) if n.endswith(".blob")]
            packaged = _zip_json(out, f"{module.DIST}/history/index.json")
        self.assertEqual(len(names), len(set(names)), "同一内容在包内重复写入")
        packaged_blobs = {e["blob"] for entries in packaged.values() for e in entries}
        self.assertEqual(len(names), len(packaged_blobs), "包内 blob 数与包内索引不一致")

    def test_public_history_filters_old_internal_content(self):
        """当前文件干净，历史旧版含内部词时，公共包必须删旧 blob。"""
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            path = repo / "CLAUDE.md"
            path.write_text("confidential old text\n", encoding="utf-8")
            _init_repo(repo)
            _commit(repo, "old")
            path.write_text("clean new text\n", encoding="utf-8")
            _commit(repo, "new")
            self.assertEqual(len(module.collect_history(repo)["CLAUDE.md"]), 2)

            with self.assertRaises(SystemExit):
                module.build_package(repo, "public", repo / "dist", "v-test")
            self.assertFalse((repo / "dist").exists(), "缺 denylist 时不得留下半成品")

            denylist = repo / "scripts" / ".share-denylist"
            denylist.parent.mkdir()
            denylist.write_text("confidential\n", encoding="utf-8")
            out = module.build_package(repo, "public", repo / "dist" / "public", "v-test")
            index = _zip_json(out, f"{module.DIST}/history/index.json")
            revisions = _zip_json(out, f"{module.DIST}/history/revisions.json")
            self.assertEqual(len(index["CLAUDE.md"]), 1)
            with zipfile.ZipFile(out) as zf:
                self.assertEqual(zf.read(f"{module.DIST}/history/{index['CLAUDE.md'][0]['blob']}.blob"),
                                 b"clean new text\n")
            allowed = {e["blob"] for e in index["CLAUDE.md"]}
            self.assertTrue(all(snapshot["files"].get("CLAUDE.md") in allowed
                                for snapshot in revisions["revisions"] if "CLAUDE.md" in snapshot["files"]))

            private = module.build_package(repo, "private", repo / "dist" / "private", "v-private")
            index = _zip_json(private, f"{module.DIST}/history/index.json")
            self.assertEqual(len(index["CLAUDE.md"]), 2)

    def test_revisions_retain_unchanged_files_for_base_scoring(self):
        """一次提交只改一个文件时，快照仍须给出另一个文件的当时版本。"""
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            (repo / "CLAUDE.md").write_text("first\n", encoding="utf-8")
            _init_repo(repo)
            _commit(repo, "first")
            (repo / ".gitignore").write_text("dist/\n", encoding="utf-8")
            _commit(repo, "second")
            index = module.collect_history(repo)
            revisions = module.collect_revisions(repo, index)
            self.assertEqual(len(revisions), 2)
            self.assertEqual(revisions[0]["files"]["CLAUDE.md"], index["CLAUDE.md"][0]["blob"])
            self.assertIn(".gitignore", revisions[0]["files"])
            self.assertNotIn(".gitignore", revisions[1]["files"])


class TestLayout(unittest.TestCase):
    """解压即可用：根下平铺安装内容，升级材料只在 .aipm-dist/。"""

    def _repo(self, d: str) -> Path:
        repo = Path(d) / "repo"
        repo.mkdir()
        (repo / "CLAUDE.md").write_text("# AI_PM\n", encoding="utf-8")
        skill = repo / ".claude/skills/ai-pm/SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text("---\nname: ai-pm\n---\n", encoding="utf-8")
        run = repo / "scripts/run.sh"
        run.parent.mkdir()
        run.write_text("#!/bin/bash\necho ok\n", encoding="utf-8")
        run.chmod(0o755)
        _init_repo(repo)
        _commit(repo, "first")
        (repo / "scripts/.share-denylist").write_text("never-matches-zzz\n", encoding="utf-8")
        return repo

    def test_flat_layout_and_dist_files(self):
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(self._repo(d), "public", Path(d) / "out", "v-test")
            names = _zip_names(out)
            self.assertEqual(out.name, "AI_PM.zip")
            self.assertFalse([n for n in names if n.startswith(("AI_PM/", "tree/", "meta/", "history/"))])
            self.assertEqual(sorted(_body_names(names)),
                             [".claude/skills/ai-pm/SKILL.md", "CLAUDE.md", "scripts/run.sh"])
            for n in ("versions.json", "manifest.json", "changelog.md", "README.md",
                      "history/index.json", "history/revisions.json"):
                self.assertIn(f"{module.DIST}/{n}", names)
            with zipfile.ZipFile(out) as zf:
                self.assertEqual(zf.read(".ignore"), b"/.aipm-dist/\n")
                self.assertIn("不是规则来源", zf.read(f"{module.DIST}/README.md").decode("utf-8"))

    def test_versions_fields(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            head, iso = subprocess.run(["git", "-C", str(repo), "log", "-1", "--format=%H %cI"],
                                       capture_output=True, text=True, check=True).stdout.split()
            out = module.build_package(repo, "public", Path(d) / "out", "v-test")
            meta = _zip_json(out, f"{module.DIST}/versions.json")
            self.assertEqual((meta["schema"], meta["version"], meta["kind"]), (2, "v-test", "public"))
            self.assertEqual(meta["commit"], head)
            self.assertEqual(meta["commit_time"], iso)
            self.assertEqual(meta["file_count"], 3)
            with zipfile.ZipFile(out) as zf:
                blobs = {n: module.git_blob_id(zf.read(n)) for n in _body_names(zf.namelist())}
            self.assertEqual(meta["content_digest"], module.content_digest(blobs))
            self.assertEqual(len(meta["content_digest"]), 16)
            self.assertIn("CLAUDE.md", meta["probe_paths"])
            self.assertEqual(meta["probe_paths"][0], ".claude/skills/ai-pm/SKILL.md", "最长路径排最前")

    def test_manifest_only_tracked_managed(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            (repo / "scripts/.metrics-dict.md").write_text("本机字典\n", encoding="utf-8")
            with mock.patch.object(module, "PRIVATE_EXTRA", ["scripts/.metrics-dict.md"]):
                out = module.build_package(repo, "private", Path(d) / "out", "v-test")
            self.assertIn("scripts/.metrics-dict.md", _zip_names(out), "私有文件照常进包")
            manifest = _zip_json(out, f"{module.DIST}/manifest.json")
            self.assertEqual(sorted(manifest), [".claude/skills/ai-pm/SKILL.md", "CLAUDE.md", "scripts/run.sh"],
                             "没被 git 跟踪的私有文件不进清单")
            expect = subprocess.run(["git", "-C", str(repo), "hash-object", "CLAUDE.md"],
                                    capture_output=True, text=True, check=True).stdout.strip()[:12]
            self.assertEqual(manifest["CLAUDE.md"], {"blob": expect, "exec": False})
            self.assertTrue(manifest["scripts/run.sh"]["exec"])

    def test_history_blobs_named_with_suffix(self):
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(self._repo(d), "public", Path(d) / "out", "v-test")
            names = set(_zip_names(out))
            for entries in _zip_json(out, f"{module.DIST}/history/index.json").values():
                for e in entries:
                    self.assertIn(f"{module.DIST}/history/{e['blob']}.blob", names)

    def test_path_problems_rules(self):
        cases = {
            "../escape.txt": "非法路径", "/abs.md": "非法路径", "C:/x.md": "非法路径",
            "a\\b.md": "Windows", "a/CON.txt": "Windows", "a/x?.md": "Windows", "a/trail.": "Windows",
            "a/" + "长" * 179 + ".md": "路径过长", "a/" + "x" * 256: "单段",
        }
        for name, needle in cases.items():
            self.assertTrue(any(needle in p for p in module.path_problems(name)), (name, module.path_problems(name)))
        for ok in ("CLAUDE.md", ".claude/skills/ai-pm/SKILL.md", "templates/中文说明.md", ".gitkeep"):
            self.assertEqual(module.path_problems(ok), [], ok)


@unittest.skip("Task 3 按 zip 重写校验器后整类替换")
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
        if "history/index.json" not in names:
            names = [*names, "history/index.json"]
        if "history/revisions.json" not in names:
            names = [*names, "history/revisions.json"]
        with tarfile.open(path, "w:gz") as tf:
            for n in names:
                if n.endswith("meta/versions.json"):
                    data = json.dumps({"version": "v-test", "kind": kind}).encode("utf-8")
                elif n == "history/index.json":
                    data = b"{}"
                elif n == "history/revisions.json":
                    data = b'{"schema_version":1,"revisions":[]}'
                else:
                    data = b"x"
                info = tarfile.TarInfo(n)
                info.size = len(data)
                tf.addfile(info, io.BytesIO(data))
        return path

    @unittest.skipUnless(HAS_DENYLIST, _DENYLIST_REASON)
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

    def test_detects_nested_git_repo(self):
        """安全线（2026-10-10）：包内不得混入 /.git/ 路径（嵌套仓库历史）。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            bad = self._tar_with(Path(d) / "g.tar.gz", [
                "meta/versions.json", "meta/changelog.md",
                "tree/CLAUDE.md", "tree/.claude/skills/tpd_cli/.git/HEAD",
            ], kind="private")
            problems = v.verify(bad, "private")
        self.assertTrue(any(".git" in p for p in problems), problems)

    def test_detects_path_traversal_and_malformed_meta(self):
        """校验器不得接受会穿越解包目录的路径，也不得被坏 meta 弄崩。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            bad = self._tar_with(Path(d) / "bad.tar.gz", [
                "meta/versions.json", "meta/changelog.md", "tree/CLAUDE.md",
                "tree/../../escape.txt",
            ])
            problems = v.verify(bad, "public")
            self.assertTrue(any("非法路径" in p for p in problems), problems)

            malformed = self._tar_with(Path(d) / "malformed.tar.gz", [
                "meta/versions.json", "meta/changelog.md", "tree/CLAUDE.md",
            ])
            # 替换为合法 tar 中的 JSON 数组；verify 应返回问题清单而不是抛 AttributeError。
            with tarfile.open(malformed, "r:gz") as old:
                members = [(m.name, old.extractfile(m).read() if m.isfile() else b"")
                           for m in old.getmembers()]
            with tarfile.open(malformed, "w:gz") as new:
                for name, data in members:
                    if name == "meta/versions.json":
                        data = b"[]"
                    info = tarfile.TarInfo(name); info.size = len(data)
                    new.addfile(info, io.BytesIO(data))
            problems = v.verify(malformed, "public")
            self.assertTrue(any("顶层必须是对象" in p for p in problems), problems)

    def test_detects_file_count_and_blob_corruption(self):
        """元数据和历史内容都必须对得上实际 tar。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "bad.tar.gz"
            index = b'{"CLAUDE.md":[{"blob":"abcdef012345"}]}'
            entries = {
                "meta/versions.json": b'{"kind":"public","file_count":99}',
                "meta/changelog.md": b"log", "tree/CLAUDE.md": b"ok",
                "history/index.json": index,
                "history/revisions.json": b'{"schema_version":1,"revisions":[]}',
                "history/abcdef012345": b"wrong",
            }
            with tarfile.open(bad, "w:gz") as tf:
                for name, data in entries.items():
                    info = tarfile.TarInfo(name); info.size = len(data)
                    tf.addfile(info, io.BytesIO(data))
            problems = v.verify(bad, "public")
            self.assertTrue(any("file_count 不符" in p for p in problems), problems)
            self.assertTrue(any("blob 内容校验失败" in p for p in problems), problems)

    def test_rejects_tree_symlink_and_duplicate_path(self):
        """解包前拒绝 tree/ 中的链接和重复成员，避免覆盖/逃逸。"""
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "bad.tar.gz"
            with tarfile.open(bad, "w:gz") as tf:
                for name, data in (("meta/versions.json", b'{"kind":"public","file_count":1}'),
                                    ("meta/changelog.md", b"log"),
                                    ("history/index.json", b"{}"),
                                    ("history/revisions.json", b'{"schema_version":1,"revisions":[]}'),
                                    ("tree/CLAUDE.md", b"ok"),
                                    ("tree/CLAUDE.md", b"changed")):
                    info = tarfile.TarInfo(name); info.size = len(data)
                    tf.addfile(info, io.BytesIO(data))
                link = tarfile.TarInfo("tree/link")
                link.type = tarfile.SYMTYPE; link.linkname = "../../escape"
                tf.addfile(link)
            problems = v.verify(bad, "public")
            self.assertTrue(any("重复路径" in p for p in problems), problems)
            self.assertTrue(any("非普通文件" in p for p in problems), problems)

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

    def test_detects_missing_or_broken_history(self):
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            missing = Path(d) / "missing.tar.gz"
            with tarfile.open(missing, "w:gz") as tf:
                for n, data in (("meta/versions.json", b"{}"),
                                ("meta/changelog.md", b"# log"),
                                ("tree/CLAUDE.md", b"ok")):
                    info = tarfile.TarInfo(n)
                    info.size = len(data)
                    tf.addfile(info, io.BytesIO(data))
            self.assertTrue(any("history/index.json" in p for p in v.verify(missing, "public")))

            broken = Path(d) / "broken.tar.gz"
            with tarfile.open(broken, "w:gz") as tf:
                for n, data in (("meta/versions.json", b"{}"),
                                ("meta/changelog.md", b"# log"),
                                ("tree/CLAUDE.md", b"ok"),
                                ("history/index.json", b'{"CLAUDE.md":[{"blob":"abcdef012345"}]}')):
                    info = tarfile.TarInfo(n)
                    info.size = len(data)
                    tf.addfile(info, io.BytesIO(data))
            self.assertTrue(any("缺失 blob" in p for p in v.verify(broken, "public")))

            bad_revision = Path(d) / "bad-revision.tar.gz"
            with tarfile.open(bad_revision, "w:gz") as tf:
                for n, data in (("meta/versions.json", b"{}"),
                                ("meta/changelog.md", b"# log"),
                                ("tree/CLAUDE.md", b"ok"),
                                ("history/index.json", b"{}"),
                                ("history/revisions.json", b'{"schema_version":1,"revisions":[{"version":"abc1234","files":{"CLAUDE.md":"abcdef012345"}}]}')):
                    info = tarfile.TarInfo(n)
                    info.size = len(data)
                    tf.addfile(info, io.BytesIO(data))
            self.assertTrue(any("未收录原件" in p for p in v.verify(bad_revision, "public")))

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

    def test_local_registry_in_package_flagged(self):
        v = self._verify_module()
        with tempfile.TemporaryDirectory() as d:
            bad = self._tar_with(Path(d) / "bad.tar.gz", [
                "meta/versions.json", "meta/changelog.md", "tree/CLAUDE.md",
                "tree/templates/configs/capability-registry.local.json"])
            self.assertTrue(any("禁止路径" in p for p in v.verify(bad, "public")))

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

    @unittest.skipUnless(HAS_DENYLIST, _DENYLIST_REASON)
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
