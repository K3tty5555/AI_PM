#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""打包器单元测试。"""
from __future__ import annotations

import contextlib
import importlib.util
import io
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
HAS_PRIVATE_INPUTS = (all((ROOT / p.rstrip("/")).exists() for p in module.PRIVATE_EXTRA)
                      and all(Path(src).is_dir() for src in module.PRIVATE_MAPPED.values()))
_PRIVATE_INPUTS_REASON = "私有版额外路径不全（分发环境或他人机器），私有包打不出来"


def _rg_executable() -> str | None:
    """本机终端里的 rg 是转调 Claude 内置程序的 shell 函数，PATH 上没有：退回 CLAUDE_CODE_EXECPATH。"""
    found = shutil.which("rg")
    if found:
        return found
    exe = os.environ.get("CLAUDE_CODE_EXECPATH")
    return exe if exe and Path(exe).is_file() else None


RG = _rg_executable()

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
    if not HAS_PRIVATE_INPUTS:
        print(f"N/A: {_PRIVATE_INPUTS_REASON}；依赖它的用例已跳过")



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

    @unittest.skipUnless(HAS_PRIVATE_INPUTS, _PRIVATE_INPUTS_REASON)
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
                with mock.patch.multiple(module, PRIVATE_EXTRA=[], PRIVATE_MAPPED={}), \
                        self.assertRaises(SystemExit, msg=kind) as ctx:
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
            out = module.build_package(ROOT, "public", Path(d), version="v0.6.0-test", allow_dirty=True)
            names = _zip_names(out)
            self.assertIn(f"{module.DIST}/versions.json", names)
            self.assertIn(f"{module.DIST}/changelog.md", names)
            self.assertIn(".claude/skills/ai-pm/SKILL.md", names, "解压后根下必须直接是 AI_PM 内容")

    @unittest.skipUnless(HAS_DENYLIST, _DENYLIST_REASON)
    def test_zip_excludes_conversations(self):
        with tempfile.TemporaryDirectory() as d:
            out = module.build_package(ROOT, "public", Path(d), version="v0.6.0-test", allow_dirty=True)
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
            out = module.build_package(ROOT, "public", Path(d), version="v-test", allow_dirty=True)
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
            out = module.build_package(ROOT, "public", Path(d), version="v-test", allow_dirty=True)
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
            out = module.build_package(repo, "public", repo / "dist" / "public", "v-test", allow_dirty=True)
            index = _zip_json(out, f"{module.DIST}/history/index.json")
            revisions = _zip_json(out, f"{module.DIST}/history/revisions.json")
            self.assertEqual(len(index["CLAUDE.md"]), 1)
            with zipfile.ZipFile(out) as zf:
                self.assertEqual(zf.read(f"{module.DIST}/history/{index['CLAUDE.md'][0]['blob']}.blob"),
                                 b"clean new text\n")
            allowed = {e["blob"] for e in index["CLAUDE.md"]}
            self.assertTrue(all(snapshot["files"].get("CLAUDE.md") in allowed
                                for snapshot in revisions["revisions"] if "CLAUDE.md" in snapshot["files"]))

            with mock.patch.multiple(module, PRIVATE_EXTRA=[], PRIVATE_MAPPED={}):
                private = module.build_package(repo, "private", repo / "dist" / "private", "v-private",
                                               allow_dirty=True)
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
            with mock.patch.multiple(module, PRIVATE_EXTRA=["scripts/.metrics-dict.md"], PRIVATE_MAPPED={}):
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


class TestGuards(unittest.TestCase):
    def _repo(self, d: str) -> Path:
        repo = Path(d) / "repo"
        repo.mkdir()
        (repo / "CLAUDE.md").write_text("ok\n", encoding="utf-8")
        run = repo / "scripts/run.sh"
        run.parent.mkdir()
        run.write_text("#!/bin/bash\n", encoding="utf-8")
        run.chmod(0o755)
        _init_repo(repo)
        _commit(repo, "first")
        (repo / "scripts/.share-denylist").write_text("never-matches-zzz\n", encoding="utf-8")
        return repo

    def test_dirty_tracked_file_refuses(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            (repo / "CLAUDE.md").write_text("changed\n", encoding="utf-8")
            with self.assertRaises(SystemExit) as ctx:
                module.build_package(repo, "public", Path(d) / "out", "v-test")
            self.assertIn("CLAUDE.md", str(ctx.exception))
            self.assertFalse((Path(d) / "out").exists(), "拒绝时不得留下目录或半成品")
            module.build_package(repo, "public", Path(d) / "out", "v-test", allow_dirty=True)

    def test_untracked_file_does_not_block(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            (repo / "notes.txt").write_text("scratch\n", encoding="utf-8")
            out = module.build_package(repo, "public", Path(d) / "out", "v-test")
            self.assertNotIn("notes.txt", _zip_names(out))

    def test_refuses_overwrite_before_heavy_work(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            module.build_package(repo, "public", Path(d) / "out", "v-test")
            with mock.patch.object(module, "collect_history", side_effect=AssertionError("不该先算历史")):
                with self.assertRaises(SystemExit) as ctx:
                    module.build_package(repo, "public", Path(d) / "out", "v-test")
            self.assertIn("--force", str(ctx.exception))
            module.build_package(repo, "public", Path(d) / "out", "v-test", force=True)

    def test_out_must_be_folder(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(SystemExit) as ctx:
                module.build_package(self._repo(d), "public", Path(d) / "x.zip", "v-test")
            self.assertIn("文件夹", str(ctx.exception))

    def test_bad_path_refused_at_build(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            (repo / "a").mkdir()
            (repo / "a/x?.md").write_text("x\n", encoding="utf-8")
            _commit(repo, "bad name")
            with self.assertRaises(SystemExit) as ctx:
                module.build_package(repo, "public", Path(d) / "out", "v-test")
            self.assertIn("Windows", str(ctx.exception))

    def test_entry_attributes_and_commit_time(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            ts = int(subprocess.run(["git", "-C", str(repo), "log", "-1", "--format=%ct"],
                                    capture_output=True, text=True, check=True).stdout)
            out = module.build_package(repo, "public", Path(d) / "out", "v-test")
            with zipfile.ZipFile(out) as zf:
                infos = {i.filename: i for i in zf.infolist()}
            expect_time = tuple(time.localtime(ts)[:6])
            for info in infos.values():
                self.assertEqual(info.compress_type, zipfile.ZIP_DEFLATED, info.filename)
                self.assertEqual(info.create_system, 3, info.filename)
                self.assertTrue(stat.S_ISREG(info.external_attr >> 16), info.filename)
                # zip 时间精度 2 秒：只比到分钟
                self.assertEqual(info.date_time[:5], expect_time[:5], info.filename)
            self.assertEqual((infos["scripts/run.sh"].external_attr >> 16) & 0o777, 0o755)
            self.assertEqual((infos["CLAUDE.md"].external_attr >> 16) & 0o777, 0o644)
            body = _body_names(list(infos))
            self.assertEqual(body, sorted(body), "条目要按路径排序写入")

    def test_exec_bit_follows_git_index_not_filesystem(self):
        """core.fileMode=false 下 index 与文件系统权限可以不同：以 index 为准，两个方向都验。"""
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d) / "repo"
            (repo / "scripts").mkdir(parents=True)
            subprocess.run(["git", "-c", "init.defaultBranch=main", "init", "-q", str(repo)],
                           check=True, capture_output=True)
            subprocess.run(["git", "-C", str(repo), "config", "core.fileMode", "false"], check=True)
            (repo / "CLAUDE.md").write_text("ok\n", encoding="utf-8")
            (repo / "scripts/index_x.sh").write_text("#!/bin/bash\n", encoding="utf-8")  # 文件系统 644
            fs_x = repo / "scripts/fs_x.sh"
            fs_x.write_text("#!/bin/bash\n", encoding="utf-8")
            fs_x.chmod(0o755)                                                              # 文件系统 755
            subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True, capture_output=True)
            subprocess.run(["git", "-C", str(repo), "update-index", "--chmod=+x", "scripts/index_x.sh"], check=True)
            subprocess.run(["git", "-C", str(repo), "update-index", "--chmod=-x", "scripts/fs_x.sh"], check=True)
            subprocess.run([
                "git", "-C", str(repo), "-c", "user.name=Test", "-c", "user.email=test@example.test",
                "-c", "core.hooksPath=/dev/null", "commit", "-qm", "modes",
            ], check=True, capture_output=True)
            (repo / "scripts/.share-denylist").write_text("never-matches-zzz\n", encoding="utf-8")
            out = module.build_package(repo, "public", Path(d) / "out", "v-test")
            with zipfile.ZipFile(out) as zf:
                self.assertEqual((zf.getinfo("scripts/index_x.sh").external_attr >> 16) & 0o777, 0o755)
                self.assertEqual((zf.getinfo("scripts/fs_x.sh").external_attr >> 16) & 0o777, 0o644)

    def test_untracked_private_extra_exec_from_filesystem(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            tool = repo / "vendor/tool.sh"
            tool.parent.mkdir()
            tool.write_text("#!/bin/bash\n", encoding="utf-8")
            tool.chmod(0o755)
            (repo / "vendor/a.md").write_text("a\n", encoding="utf-8")
            with mock.patch.multiple(module, PRIVATE_EXTRA=["vendor/"], PRIVATE_MAPPED={}):
                out = module.build_package(repo, "private", Path(d) / "out", "v-test")
            with zipfile.ZipFile(out) as zf:
                self.assertEqual((zf.getinfo("vendor/tool.sh").external_attr >> 16) & 0o777, 0o755)
                self.assertEqual((zf.getinfo("vendor/a.md").external_attr >> 16) & 0o777, 0o644)

    def test_missing_private_extra_fails(self):
        with tempfile.TemporaryDirectory() as d:
            repo = self._repo(d)
            with mock.patch.multiple(module, PRIVATE_EXTRA=["vendor/"], PRIVATE_MAPPED={}):
                with self.assertRaises(SystemExit) as ctx:
                    module.collect_files(repo, "private")
            self.assertIn("vendor/", str(ctx.exception))
            (repo / "vendor").mkdir()
            with mock.patch.multiple(module, PRIVATE_EXTRA=["vendor/", "scripts/.metrics-dict.md"], PRIVATE_MAPPED={}):
                with self.assertRaises(SystemExit) as ctx:
                    module.collect_files(repo, "private")
            self.assertIn(".metrics-dict.md", str(ctx.exception))

    def test_tracked_generated_names_refused(self):
        for rel in (".ignore", ".aipm-dist/x.json"):
            with tempfile.TemporaryDirectory() as d:
                repo = self._repo(d)
                p = repo / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text("x\n", encoding="utf-8")
                subprocess.run(["git", "-C", str(repo), "add", "-f", rel], check=True, capture_output=True)
                _commit(repo, "track generated name")
                with self.assertRaises(SystemExit, msg=rel):
                    module.build_package(repo, "public", Path(d) / "out", "v-test")

    def test_is_private_only(self):
        yes = [".claude/skills/tpd_cli/SKILL.md", "vendor/x/y.js", "Vendor/x.js", "scripts/.metrics-dict.md",
               "templates/knowledge-base/pitfalls/坑.md", "Templates/Knowledge-Base/pitfalls/x.md",
               "templates/persona/me.md", "output/assets/_inventory/a.json",
               ".mcp.json", "templates/personal-skills/README.md",
               "templates/personal-skills/metrics-query/SKILL.md"]
        no = ["templates/knowledge-base/README.md", "templates/knowledge-base/decisions/.gitkeep",
              "templates/persona/README.md", "templates/persona/.gitkeep", "CLAUDE.md",
              ".claude/skills/ai-pm/SKILL.md", "scripts/aipm_package.py"]
        for rel in yes:
            self.assertTrue(module.is_private_only(rel), rel)
        for rel in no:
            self.assertFalse(module.is_private_only(rel), rel)


class TestPrivateBundle(unittest.TestCase):
    """私有包从个人目录带上本机配置的私有技能与 metrics-query 安装件，并生成 Playwright 的 MCP 配置。"""

    def _setup(self, d: str):
        repo = Path(d) / "repo"
        repo.mkdir()
        (repo / "CLAUDE.md").write_text("ok\n", encoding="utf-8")
        _init_repo(repo)
        _commit(repo, "first")
        (repo / "scripts").mkdir()
        (repo / "scripts/.share-denylist").write_text("never-matches-zzz\n", encoding="utf-8")
        internal = Path(d) / "home/internal"
        (internal / "scripts").mkdir(parents=True)
        (internal / "SKILL.md").write_text("---\nname: internal-skill\n---\n", encoding="utf-8")
        run = internal / "scripts/run.cjs"
        run.write_text("x\n", encoding="utf-8")
        run.chmod(0o755)
        (internal / ".DS_Store").write_bytes(b"x")
        mq = Path(d) / "home/mq"
        mq.mkdir(parents=True)
        (mq / "SKILL.md").write_text("---\nname: metrics-query\n---\n", encoding="utf-8")
        (mq / ".env").write_text("METRICS_API_KEY=not-a-real-key\n", encoding="utf-8")
        mapped = {".claude/skills/internal-skill/": internal, "templates/personal-skills/metrics-query/": mq}
        return repo, mapped

    def test_private_gets_mapped_and_generated(self):
        with tempfile.TemporaryDirectory() as d:
            repo, mapped = self._setup(d)
            with mock.patch.multiple(module, PRIVATE_EXTRA=[], PRIVATE_MAPPED=mapped):
                out = module.build_package(repo, "private", Path(d) / "out", "v-test")
            with zipfile.ZipFile(out) as zf:
                names = zf.namelist()
                self.assertIn(".claude/skills/internal-skill/SKILL.md", names)
                self.assertIn("templates/personal-skills/metrics-query/SKILL.md", names)
                self.assertNotIn("templates/personal-skills/metrics-query/.env", names, "个人密钥绝不能进包")
                self.assertNotIn(".claude/skills/internal-skill/.DS_Store", names)
                self.assertEqual((zf.getinfo(".claude/skills/internal-skill/scripts/run.cjs").external_attr >> 16) & 0o777,
                                 0o755)
                mcp = json.loads(zf.read(".mcp.json"))
                self.assertEqual(mcp["mcpServers"]["playwright"],
                                 {"command": "npx", "args": ["-y", "@playwright/mcp@latest", "--browser", "chrome"]})
                self.assertIn("~/.claude/skills/", zf.read("templates/personal-skills/README.md").decode("utf-8"))
                meta = json.loads(zf.read(f"{module.DIST}/versions.json"))
                manifest = json.loads(zf.read(f"{module.DIST}/manifest.json"))
            self.assertEqual(meta["file_count"], len(_body_names(names)))
            self.assertFalse([k for k in manifest if k == ".mcp.json" or "internal-skill" in k or "personal-skills" in k],
                             "个人目录带来的和生成的文件都不受管，不进清单")

    def test_public_gets_none_of_them(self):
        with tempfile.TemporaryDirectory() as d:
            repo, mapped = self._setup(d)
            with mock.patch.multiple(module, PRIVATE_EXTRA=[], PRIVATE_MAPPED=mapped):
                out = module.build_package(repo, "public", Path(d) / "out", "v-test")
            names = _zip_names(out)
            self.assertFalse([n for n in names if n == ".mcp.json" or "internal-skill" in n or "personal-skills" in n])

    def test_missing_mapped_source_fails(self):
        with tempfile.TemporaryDirectory() as d:
            repo, mapped = self._setup(d)
            mapped[".claude/skills/internal-skill/"] = Path(d) / "nope"
            with mock.patch.multiple(module, PRIVATE_EXTRA=[], PRIVATE_MAPPED=mapped):
                with self.assertRaises(SystemExit) as ctx:
                    module.collect_files(repo, "private")
            self.assertIn("internal-skill", str(ctx.exception))


    def test_local_bundle_conf(self):
        """本机私有携带配置（gitignore）：内部名只写在这里，不进版本库。"""
        with tempfile.TemporaryDirectory() as d:
            conf = Path(d) / ".private-bundle.json"
            self.assertEqual(module._load_private_bundle_conf(conf), ({}, ()))
            conf.write_text(json.dumps({"mapped": {".claude/skills/internal-skill/": "~/x/internal-skill"},
                                        "sentinels": [".claude/skills/internal-skill/SKILL.md"]}), encoding="utf-8")
            mapped, sentinels = module._load_private_bundle_conf(conf)
            self.assertEqual(mapped, {".claude/skills/internal-skill/": Path.home() / "x/internal-skill"})
            self.assertEqual(sentinels, (".claude/skills/internal-skill/SKILL.md",))
            for bad in ('[]', '{"mapped": {"no-slash": "~/x"}}', '{"mapped": {"/abs/": "~/x"}}', 'not json'):
                conf.write_text(bad, encoding="utf-8")
                with self.assertRaises(SystemExit, msg=bad):
                    module._load_private_bundle_conf(conf)

    def test_generated_name_clash_with_repo_file_refused(self):
        with tempfile.TemporaryDirectory() as d:
            repo, mapped = self._setup(d)
            (repo / ".mcp.json").write_text("{}\n", encoding="utf-8")
            _commit(repo, "track mcp")
            with mock.patch.multiple(module, PRIVATE_EXTRA=[], PRIVATE_MAPPED=mapped):
                with self.assertRaises(SystemExit) as ctx:
                    module.collect_files(repo, "private")
            self.assertIn(".mcp.json", str(ctx.exception))


def _zinfo(name: str, mode: int = 0o100644, system: int = 3) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = system
    info.external_attr = mode << 16
    return info


def _valid_entries(kind: str = "public", extra: dict | None = None) -> dict[str, bytes]:
    """一个自洽的最小合法包。extra 是额外的安装内容：会同步算进 file_count 和 content_digest，
    这样每个用例只剩它要测的那一条问题，断言不会被「数目对不上」之类的噪声喂饱。"""
    body = {"CLAUDE.md": b"# AI_PM\n", ".claude/skills/ai-pm/SKILL.md": b"---\nname: ai-pm\n---\n"}
    manifest = {p: {"blob": module.git_blob_id(d), "exec": False} for p, d in body.items()}
    if kind == "private":
        for s in module.PRIVATE_SENTINELS:
            body[s] = b"private\n"
    body.update(extra or {})
    blobs = {p: module.git_blob_id(d) for p, d in body.items()}
    dist = module.DIST
    entries = dict(body)
    entries[".ignore"] = b"/.aipm-dist/\n"
    entries[f"{dist}/versions.json"] = json.dumps({
        "schema": 2, "version": "v-test", "kind": kind, "commit": "0" * 40,
        "commit_time": "2026-01-01T00:00:00+08:00", "content_digest": module.content_digest(blobs),
        "probe_paths": ["CLAUDE.md"], "built_at": "2026-01-01T00:00:00+0800",
        "file_count": len(body)}).encode()
    entries[f"{dist}/manifest.json"] = json.dumps(manifest).encode()
    entries[f"{dist}/changelog.md"] = b"# log\n"
    entries[f"{dist}/README.md"] = b"readme\n"
    entries[f"{dist}/history/index.json"] = b"{}"
    entries[f"{dist}/history/revisions.json"] = b'{"schema_version":1,"revisions":[]}'
    return entries


def _set_meta(entries: dict, **changes) -> dict:
    name = f"{module.DIST}/versions.json"
    entries[name] = json.dumps({**json.loads(entries[name]), **changes}).encode()
    return entries


def _write_zip(path: Path, entries: dict, extra: list | None = None, *,
               encrypt: tuple = (), method: dict | None = None, stored: tuple = ()) -> Path:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # 重复成员用例会触发 zipfile 的 Duplicate name 警告
        with zipfile.ZipFile(path, "w") as zf:
            for name, data in entries.items():
                info = _zinfo(name)
                if name in stored:
                    info.compress_type = zipfile.ZIP_STORED
                zf.writestr(info, data)
            for info, data in (extra or []):
                zf.writestr(info, data)
            # writestr 会把 flag_bits 清零、不认识的压缩方式直接报错：关闭前改中央目录里的字段，才造得出坏包
            for name in encrypt:
                zf.getinfo(name).flag_bits |= 0x1
            for name, m in (method or {}).items():
                zf.getinfo(name).compress_type = m
    return path


def _corrupt(path: Path, name: str) -> None:
    """翻转某条目数据区的一个字节。"""
    with zipfile.ZipFile(path) as zf:
        offset = zf.getinfo(name).header_offset
    raw = bytearray(path.read_bytes())
    n_len, x_len = struct.unpack("<HH", raw[offset + 26:offset + 30])
    raw[offset + 30 + n_len + x_len + 1] ^= 0xFF
    path.write_bytes(bytes(raw))


class TestExtract(unittest.TestCase):
    """真解压一次：根下直接是 AI_PM、执行位和中文名保留、历史原件搜不到。"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        d = Path(self.tmp.name)
        repo = d / "repo"
        repo.mkdir()
        (repo / "CLAUDE.md").write_text("OLD_ONLY_MARKER\n", encoding="utf-8")
        skill = repo / ".claude/skills/ai-pm/SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text("---\nname: ai-pm\n---\n", encoding="utf-8")
        run = repo / "scripts/run.sh"
        run.parent.mkdir()
        run.write_text("#!/bin/bash\necho ok\n", encoding="utf-8")
        run.chmod(0o755)
        zh = repo / "templates/中文说明.md"
        zh.parent.mkdir()
        zh.write_text("中文\n", encoding="utf-8")
        _init_repo(repo)
        _commit(repo, "first")
        (repo / "CLAUDE.md").write_text("new text\n", encoding="utf-8")
        _commit(repo, "second")
        (repo / "scripts/.share-denylist").write_text("never-matches-zzz\n", encoding="utf-8")
        self.zip = module.build_package(repo, "public", d / "out", "v-test")
        self.dest = d / "AI_PM"

    def _assert_install(self):
        self.assertTrue((self.dest / ".claude/skills/ai-pm/SKILL.md").is_file(),
                        "解压目录下应直接是 AI_PM 内容，不能再套一层")
        self.assertFalse((self.dest / "AI_PM").exists())
        self.assertFalse((self.dest / "tree").exists())
        self.assertTrue(os.access(self.dest / "scripts/run.sh", os.X_OK), "执行位丢了")
        self.assertEqual((self.dest / "templates/中文说明.md").read_text(encoding="utf-8"), "中文\n")

    @unittest.skipUnless(shutil.which("ditto"), "非 macOS，无 ditto")
    def test_ditto_extract(self):
        subprocess.run(["ditto", "-x", "-k", str(self.zip), str(self.dest)], check=True)
        self._assert_install()

    @unittest.skipUnless(shutil.which("unzip"), "无 unzip")
    def test_unzip_extract(self):
        subprocess.run(["unzip", "-q", str(self.zip), "-d", str(self.dest)], check=True)
        self._assert_install()

    @unittest.skipUnless(shutil.which("unzip") and RG, "无 unzip，或找不到 ripgrep（PATH 与 CLAUDE_CODE_EXECPATH 都没有）")
    def test_ignore_hides_history_from_search(self):
        subprocess.run(["unzip", "-q", str(self.zip), "-d", str(self.dest)], check=True)
        hidden = subprocess.run(["rg", "--hidden", "-l", "OLD_ONLY_MARKER", str(self.dest)],
                                executable=RG, capture_output=True, text=True)
        self.assertEqual(hidden.stdout.strip(), "", "搜规则时不该搜到历史原件")
        raw = subprocess.run(["rg", "--hidden", "--no-ignore", "-l", "OLD_ONLY_MARKER", str(self.dest)],
                             executable=RG, capture_output=True, text=True)
        self.assertIn(f"{module.DIST}/history/", raw.stdout, "前提：历史原件确实在包里")


class TestVerify(unittest.TestCase):
    def setUp(self):
        p = ROOT / "scripts" / "aipm_package_verify.py"
        s = importlib.util.spec_from_file_location("aipm_package_verify", p)
        self.v = importlib.util.module_from_spec(s)
        assert s.loader
        s.loader.exec_module(self.v)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.d = Path(self.tmp.name)

    def check(self, entries, kind="public", **kw):
        return self.v.verify(_write_zip(self.d / "p.zip", entries, **kw), kind)

    def assertFlag(self, problems, needle):
        self.assertTrue(any(needle in p for p in problems), problems)

    def test_minimal_valid_passes(self):
        self.assertEqual(self.check(_valid_entries("public")), [])
        self.assertEqual(self.check(_valid_entries("private"), "private"), [])

    @unittest.skipUnless(HAS_DENYLIST, _DENYLIST_REASON)
    def test_clean_package_passes(self):
        out = module.build_package(ROOT, "public", self.d / "pub", version="v-test", allow_dirty=True)
        self.assertEqual(self.v.verify(out, "public"), [])

    @unittest.skipUnless(HAS_PRIVATE_INPUTS, _PRIVATE_INPUTS_REASON)
    def test_clean_private_package_passes(self):
        out = module.build_package(ROOT, "private", self.d / "pri", version="v-test", allow_dirty=True)
        self.assertEqual(self.v.verify(out, "private"), [])
        self.assertFlag(self.v.verify(out, "public"), "kind")

    def test_not_a_zip_and_missing_file(self):
        bad = self.d / "bad.zip"
        bad.write_bytes(b"not a zip")
        self.assertFlag(self.v.verify(bad, "public"), "不是合法的 zip")
        self.assertFlag(self.v.verify(self.d / "nope.zip", "public"), "不是合法的 zip")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.v.main([str(self.d / "nope.zip"), "--kind", "public"]), 1)

    def test_invalid_utf8_filename_does_not_raise(self):
        """条目标了 UTF-8 但文件名字节不是合法 UTF-8：zipfile 打开时抛 UnicodeDecodeError，校验器不能跟着崩。"""
        good = "templates/\u00e9zz.md".encode("utf-8")
        bad = good.replace(b"\xc3\xa9", b"\xc3\x28")
        path = _write_zip(self.d / "u.zip", _valid_entries(extra={good.decode("utf-8"): b"x"}))
        raw = path.read_bytes()
        self.assertEqual(raw.count(good), 2, "前提：本地头和中央目录各一份文件名")
        path.write_bytes(raw.replace(good, bad))
        self.assertFlag(self.v.verify(path, "public"), "不是合法的 zip")
        self.assertEqual(self.v.collect_warnings(path), [])
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.v.main([str(path), "--kind", "public"]), 1)

    def test_non_string_probe_path_is_a_problem(self):
        self.assertFlag(self.check(_set_meta(_valid_entries(), probe_paths=[["x"]])),
                        "probe_paths 里有非字符串条目")

    def test_each_forbidden_rule(self):
        for frag in self.v.FORBIDDEN:
            name = "a/" + frag.lstrip("/") + "x"
            self.assertFlag(self.check(_valid_entries(extra={name: b"x"})), "禁止路径")

    def test_forbidden_ignores_case(self):
        self.assertFlag(self.check(_valid_entries(extra={"a/.AI-SHARED/Conversations/x": b"x"})), "禁止路径")

    def test_root_docs_only(self):
        self.assertFlag(self.check(_valid_entries(extra={"docs/internal/secret.md": b"x"})), "禁止路径")

    def test_legit_assets_not_flagged(self):
        """回归：真实踩过的误杀，逐条钉住（私有包里才合法的放 private）。"""
        legit = {
            "templates/prd-styles/default/style-config.json": b"{}",
            "tsconfig.json": b"{}",
            "output/assets/AI_PM知识库蒸馏-20260902/content-full/docs/01.md": b"x",
            "scripts/ai-sync/snapshot-claude-conversations.sh": b"x",
            "scripts/ai-sync/snapshot-codex-conversations.sh": b"x",
        }
        self.assertEqual(self.check(_valid_entries("private", extra=legit), "private"), [])

    def test_nested_git(self):
        self.assertFlag(self.check(_valid_entries(extra={".claude/skills/foo/.git/HEAD": b"ref"})), "禁止路径")

    def test_path_rules_applied(self):
        self.assertFlag(self.check(_valid_entries(extra={"a/x?.md": b"x"})), "Windows")
        self.assertFlag(self.check(_valid_entries(extra={"../escape.txt": b"x"})), "非法路径")

    def test_duplicates_ignore_case_unicode_and_dirs(self):
        self.assertFlag(self.check(_valid_entries(extra={"A.md": b"1"}), extra=[(_zinfo("a.md"), b"2")]),
                        "重复路径")
        nfc, nfd = unicodedata.normalize("NFC", "é.md"), unicodedata.normalize("NFD", "é.md")
        self.assertFlag(self.check(_valid_entries(extra={nfc: b"1"}), extra=[(_zinfo(nfd), b"2")]), "重复路径")
        self.assertFlag(self.check(_valid_entries(extra={"a": b"1", "A/b.md": b"2"})), "文件与目录重名")

    def test_entry_type_rules(self):
        self.assertFlag(self.check(_valid_entries(), extra=[(_zinfo("link", 0o120777), b"../x")]), "符号链接")
        self.assertFlag(self.check(_valid_entries(), extra=[(_zinfo("win.md", system=0), b"x")]), "Unix 权限")

    def test_unreadable_entries_reported_not_raised(self):
        """加密、不支持的压缩方式、数据损坏：都要变成问题条目，不能抛 Python 报错。"""
        self.assertFlag(self.check(_valid_entries(), encrypt=("CLAUDE.md",)), "加密")
        self.assertFlag(self.check(_valid_entries(), method={"CLAUDE.md": 99}), "不支持的压缩方式")
        for stored in (("CLAUDE.md",), ()):
            path = _write_zip(self.d / f"c{len(stored)}.zip", _valid_entries(extra={"big.md": b"Z" * 4000}),
                              stored=stored)
            _corrupt(path, "CLAUDE.md" if stored else "big.md")
            problems = self.v.verify(path, "public")
            self.assertTrue(any("CRC" in p or "读不出" in p for p in problems), problems)
        # changelog 不会被内容核对读取：只有 testzip 抓得到它的损坏
        path = _write_zip(self.d / "c_log.zip", _valid_entries(extra={"big.md": b"Z" * 4000}))
        _corrupt(path, f"{module.DIST}/changelog.md")
        self.assertFlag(self.v.verify(path, "public"), "CRC")

    def test_size_caps(self):
        with mock.patch.object(self.v, "MAX_FILE_MB", 0):
            problems = self.check(_valid_entries())
        self.assertFlag(problems, "单个文件")
        self.assertFlag(problems, "跳过")
        with mock.patch.object(self.v, "MAX_TOTAL_MB", 0):
            self.assertFlag(self.check(_valid_entries()), "解压后总量")
        with mock.patch.object(self.v, "MAX_MB", {"public": 0.0000001}):
            self.assertFlag(self.check(_valid_entries()), "体积")

    def test_dist_whitelist(self):
        for name in (f"{module.DIST}/extra.txt", f"{module.DIST}/history/abc.blob",
                     f"{module.DIST}/history/0123456789ab", ".AIPM-DIST/x.txt"):
            e = _valid_entries()
            e[name] = b"x"
            self.assertFlag(self.check(e), "白名单外")

    def test_missing_required(self):
        for name in (".claude/skills/ai-pm/SKILL.md", "CLAUDE.md", ".ignore",
                     f"{module.DIST}/manifest.json", f"{module.DIST}/history/index.json"):
            e = _valid_entries()
            del e[name]
            self.assertFlag(self.check(e), f"缺少必需文件：{name}")

    def test_ignore_content(self):
        e = _valid_entries()
        e[".ignore"] = b""
        self.assertFlag(self.check(e), ".ignore")

    def test_versions_rules(self):
        e = _valid_entries()
        e[f"{module.DIST}/versions.json"] = b"[]"
        self.assertFlag(self.check(e), "顶层必须是对象")
        for change, needle in (({"file_count": 99}, "file_count 不符"), ({"schema": 1}, "schema"),
                               ({"kind": "private"}, "kind 不符"), ({"commit": None}, "commit"),
                               ({"content_digest": "0" * 16}, "content_digest"),
                               ({"probe_paths": ["ghost.md"]}, "probe_paths")):
            self.assertFlag(self.check(_set_meta(_valid_entries(), **change)), needle)

    def test_kind_content_rules(self):
        self.assertFlag(self.check(_valid_entries(extra={".claude/skills/tpd_cli/SKILL.md": b"x"})),
                        "公共包混入私有内容")
        self.assertFlag(self.check(_valid_entries(extra={"Vendor/x.js": b"x"})), "公共包混入私有内容")
        self.assertFlag(self.check(_valid_entries(extra={".mcp.json": b"{}"})), "公共包混入私有内容")
        e = _valid_entries("private")
        del e["scripts/.metrics-dict.md"]
        self.assertFlag(self.check(e, "private"), "私有包缺关键文件")
        e = _valid_entries("private")
        del e["templates/personal-skills/metrics-query/SKILL.md"]
        self.assertFlag(self.check(e, "private"), "私有包缺关键文件")

    def test_personal_key_file_forbidden(self):
        self.assertFlag(self.check(_valid_entries("private", extra={
            "templates/personal-skills/metrics-query/.env": b"METRICS_API_KEY=x"}), "private"), "禁止路径")

    def test_manifest_rules(self):
        dist = module.DIST
        e = _valid_entries()
        e[f"{dist}/manifest.json"] = json.dumps({"scripts/ghost.py": {"blob": "0" * 12, "exec": False}}).encode()
        self.assertFlag(self.check(e), "清单里的文件不在包里")
        e = _valid_entries()
        e[f"{dist}/manifest.json"] = json.dumps({"CLAUDE.md": {"blob": "0" * 12, "exec": False}}).encode()
        self.assertFlag(self.check(e), "清单 blob 不符")
        e = _valid_entries()
        e[f"{dist}/manifest.json"] = json.dumps(
            {"CLAUDE.md": {"blob": module.git_blob_id(b"# AI_PM\n"), "exec": True}}).encode()
        self.assertFlag(self.check(e), "执行位")
        e = _valid_entries(extra={"README.md": b"x"})
        e[f"{dist}/manifest.json"] = json.dumps(
            {"README.md": {"blob": module.git_blob_id(b"x"), "exec": False}}).encode()
        self.assertFlag(self.check(e), "非受管")

    def test_history_rules(self):
        dist = module.DIST
        e = _valid_entries()
        e[f"{dist}/history/index.json"] = b'{"CLAUDE.md":[{"blob":"abcdef012345"}]}'
        self.assertFlag(self.check(e), "缺失 blob")
        e[f"{dist}/history/abcdef012345.blob"] = b"wrong"
        self.assertFlag(self.check(e), "blob 内容校验失败")
        e = _valid_entries()
        e[f"{dist}/history/index.json"] = b'{"../x":[]}'
        self.assertFlag(self.check(e), "非法路径")
        e = _valid_entries()
        e[f"{dist}/history/revisions.json"] = (
            b'{"schema_version":1,"revisions":[{"version":"abc1234","files":{"CLAUDE.md":"abcdef012345"}}]}')
        self.assertFlag(self.check(e), "未收录原件")

    def test_public_history_private_path(self):
        dist = module.DIST
        blob = module.git_blob_id(b"secret")
        e = _valid_entries()
        e[f"{dist}/history/index.json"] = json.dumps(
            {".claude/skills/tpd_cli/SKILL.md": [{"blob": blob}]}).encode()
        e[f"{dist}/history/{blob}.blob"] = b"secret"
        self.assertFlag(self.check(e), "公共包历史里混入私有路径")

    def test_ds_store_warn_only(self):
        path = _write_zip(self.d / "n.zip", _valid_entries(extra={"templates/x/.DS_Store": b"x"}))
        self.assertEqual(self.v.verify(path, "public"), [])
        self.assertTrue(self.v.collect_warnings(path))

    def test_main_exit_code(self):
        ok = _write_zip(self.d / "ok.zip", _valid_entries())
        bad = _write_zip(self.d / "bad.zip", _valid_entries(extra={".ai-shared/conversations/raw/x.jsonl": b"s"}))
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.v.main([str(ok), "--kind", "public"]), 0)
            self.assertEqual(self.v.main([str(bad), "--kind", "public"]), 1)



class TestDuplicatePaths(unittest.TestCase):
    """打包前就拦住解压到大小写不敏感文件系统会互相覆盖的路径。"""

    def test_case_and_unicode_duplicates(self):
        nfd = unicodedata.normalize("NFD", "templates/é.md")
        problems = module.duplicate_problems(["A.md", "a.md", "templates/é.md", nfd, "ok.md"])
        self.assertEqual(len(problems), 2, problems)
        self.assertTrue(all("重复路径" in p for p in problems), problems)
        self.assertIn("A.md", problems[0])

    def test_file_directory_clash(self):
        problems = module.duplicate_problems(["Docs", "docs/x.md"])
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("文件与目录重名", problems[0])

    def test_clean_list_has_no_problems(self):
        self.assertEqual(module.duplicate_problems(["a/b.md", "a/c.md", "b.md"]), [])

    def test_build_refuses_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(module, "collect_files", return_value=["A.md", "a.md"]):
            with self.assertRaises(SystemExit) as cm:
                module.build_package(Path(tmp), "public", Path(tmp) / "out", "v", allow_dirty=True)
        self.assertIn("A.md", str(cm.exception))
        self.assertFalse((Path(tmp) / "out").exists())


class TestSetUpModuleNotice(unittest.TestCase):
    def test_private_inputs_missing_prints_na(self):
        buf = io.StringIO()
        with mock.patch.dict(globals(), {"HAS_PRIVATE_INPUTS": False, "HAS_PRIVATE_SKILLS": True,
                                         "HAS_DENYLIST": True}), contextlib.redirect_stdout(buf):
            setUpModule()
        self.assertIn(f"N/A: {_PRIVATE_INPUTS_REASON}", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
