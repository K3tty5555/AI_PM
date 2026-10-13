#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""发布闸：打包 → 校验 → 解压 → 开场提示 → 升级预演，一条链跑到底。

各环节原本分别有测试，但没有一条用例把它们串起来：打包器写的元数据、校验器的判断、
解压后的目录、开场脚本读到的版本、升级要用的基准原件，任何一环对不上都只会在用户机器上暴露。
（2026-10-13，验收报告 P1 建议）

升级由 Claude 按 ai-pm-update 技能执行，没有脚本。这里的 _dry_run_plan 是技能阶段 0–2
里能机械判断那部分的参照实现：新包是否完整、基准从哪来、每个受管文件属于哪一类。
"""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


pkg = _load("aipm_package")
verifier = _load("aipm_package_verify")
DIST = pkg.DIST

BOTH_BASE = "".join(f"第 {i} 行\n" for i in range(1, 21))


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), "-c", "core.hooksPath=/dev/null",
                    "-c", "user.name=Test", "-c", "user.email=test@example.test", *args],
                   check=True, capture_output=True)


def _write(root: Path, rel: str, text: str, exe: bool = False) -> None:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    if exe:
        p.chmod(0o755)


def _unzip(zip_path: Path, dest: Path) -> None:
    subprocess.run(["unzip", "-q", str(zip_path), "-d", str(dest)], check=True)


def _blob(path: Path) -> str | None:
    return pkg.git_blob_id(path.read_bytes()) if path.is_file() else None


def _json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _dry_run_plan(install: Path, new: Path) -> dict[str, str]:
    """技能阶段 0–2 的可机械判断部分：受管文件 → 类别。阶段 0 的检查不过就抛 AssertionError。"""
    new_manifest = _json(new / DIST / "manifest.json")
    missing = [p for p in new_manifest if not (new / p).is_file()]
    missing += [p for p in _json(new / DIST / "versions.json")["probe_paths"] if not (new / p).is_file()]
    assert not missing, f"新包不完整：{missing}"
    base_file = install / DIST / "base.json"
    base = _json(base_file if base_file.is_file() else install / DIST / "manifest.json")
    plan = {}
    for rel in sorted(set(new_manifest) | set(base)):
        b = base.get(rel, {}).get("blob")
        t = new_manifest.get(rel, {}).get("blob")
        o = _blob(install / rel)
        if t is None:
            plan[rel] = "官方删除" if o == b else "官方删除·你改过"
        elif b is None:
            plan[rel] = "官方新增" if o is None else ("相同" if o == t else "两边都新增")
        elif o is None:
            plan[rel] = "你删除了"
        elif o == b:
            plan[rel] = "不变" if t == b else "只有官方改"
        elif t == b or o == t:
            plan[rel] = "只有你改" if t == b else "相同"
        else:
            plan[rel] = "两边都改"
    return plan


@unittest.skipUnless(shutil.which("unzip"), "本机没有 unzip")
class TestReleaseEndToEnd(unittest.TestCase):
    """v1 打包安装、用户改两处；官方出 v2；拿 v1 安装对 v2 新包做升级预演。"""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        d = cls.d = Path(cls._tmp.name)
        repo = cls.repo = d / "repo"
        _write(repo, ".gitignore", "scripts/.share-denylist\n")
        _write(repo, "CLAUDE.md", "# AI_PM\n")
        _write(repo, ".claude/skills/ai-pm/SKILL.md", "---\nname: ai-pm\n---\n")
        _write(repo, ".claude/hooks/session-start.sh",
               (ROOT / ".claude/hooks/session-start.sh").read_text(encoding="utf-8"), exe=True)
        _write(repo, "scripts/run.sh", "#!/bin/bash\necho ok\n", exe=True)
        _write(repo, "scripts/upstream_only.py", "VALUE = 1\n")
        _write(repo, "scripts/user_only.py", "VALUE = 1\n")
        _write(repo, "scripts/stable.py", "VALUE = 1\n")
        _write(repo, "scripts/deleted.py", "VALUE = 1\n")
        _write(repo, "templates/both.md", BOTH_BASE)
        _write(repo, "templates/.DS_Store", "junk")
        _git(repo, "init", "-q", "-b", "main")
        _git(repo, "add", "-A")
        _git(repo, "commit", "-qm", "v1")
        # 公共包要过滤历史里的内部名：给一份不会命中的本机清单（同 test_aipm_package 的做法）
        _write(repo, "scripts/.share-denylist", "never-matches-zzz\n")

        cls.zip1 = pkg.build_package(repo, "public", d / "out1", "0.1.0")
        cls.install = d / "install"
        _unzip(cls.zip1, cls.install)
        _write(cls.install, "scripts/user_only.py", "VALUE = 1\nMINE = True\n")
        _write(cls.install, "templates/both.md", BOTH_BASE.replace("第 18 行", "第 18 行（我改的）"))

        _write(repo, "scripts/upstream_only.py", "VALUE = 2\n")
        _write(repo, "templates/both.md", BOTH_BASE.replace("第 2 行", "第 2 行（官方改的）"))
        _write(repo, "scripts/added.py", "NEW = True\n")
        (repo / "scripts/deleted.py").unlink()
        _git(repo, "add", "-A")
        _git(repo, "commit", "-qm", "v2")
        cls.zip2 = pkg.build_package(repo, "public", d / "out2", "0.2.0")
        cls.new = d / "new"
        _unzip(cls.zip2, cls.new)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_both_packages_pass_verify_without_noise(self):
        for z in (self.zip1, self.zip2):
            self.assertEqual(verifier.verify(z, "public"), [])
            self.assertEqual(verifier.collect_warnings(z), [], "正式包不该再带 .DS_Store 之类的噪声")

    def test_extracted_install_matches_manifest(self):
        manifest = _json(self.install / DIST / "manifest.json")
        self.assertTrue(manifest)
        for rel, entry in manifest.items():
            if rel in ("scripts/user_only.py", "templates/both.md"):
                continue  # 用户改过
            self.assertEqual(_blob(self.install / rel), entry["blob"], rel)
            self.assertEqual(os.access(self.install / rel, os.X_OK), entry["exec"], rel)
        self.assertTrue((self.install / ".claude/skills/ai-pm/SKILL.md").is_file(), "解压根下直接是 AI_PM")

    def test_session_start_shows_installed_version(self):
        for folder, label in ((self.install, "0.1.0"), (self.new, "0.2.0")):
            env = {"PATH": "/usr/bin:/bin", "HOME": str(self.d / "home"),
                   "AIPM_CLOUD_DOC_STATE_DIR": str(self.d / "state")}
            r = subprocess.run(["bash", ".claude/hooks/session-start.sh"], cwd=folder, env=env,
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(json.loads(r.stdout)["systemMessage"], f"📦 当前 AI_PM 版本：{label}（公共版）")

    def test_new_package_is_a_different_version(self):
        old = _json(self.install / DIST / "versions.json")
        new = _json(self.new / DIST / "versions.json")
        self.assertNotEqual((old["commit"], old["content_digest"]), (new["commit"], new["content_digest"]))

    def test_dry_run_plan(self):
        self.assertEqual(_dry_run_plan(self.install, self.new), {
            ".claude/hooks/session-start.sh": "不变",
            ".gitignore": "不变",
            ".claude/skills/ai-pm/SKILL.md": "不变",
            "CLAUDE.md": "不变",
            "scripts/added.py": "官方新增",
            "scripts/deleted.py": "官方删除",
            "scripts/run.sh": "不变",
            "scripts/stable.py": "不变",
            "scripts/upstream_only.py": "只有官方改",
            "scripts/user_only.py": "只有你改",
            "templates/both.md": "两边都改",
        })

    def test_base_adoption_sample_passes(self):
        """技能阶段 2 第 4 步：抽样用户不太会改的文件，和新包里的基准原件逐字比，至少 4/5 一致才采信。"""
        base = _json(self.install / DIST / "manifest.json")
        sample = [p for p in sorted(base) if p.startswith("scripts/")][:5]
        same = sum((self.new / DIST / "history" / f"{base[p]['blob']}.blob").read_bytes()
                   == (self.install / p).read_bytes() for p in sample)
        self.assertGreaterEqual(same, min(4, len(sample)))

    def test_three_way_merge_keeps_both_edits(self):
        """两边都改的文件：基准原件要在新包里，三方合并后两边的改动都在。"""
        base_blob = _json(self.install / DIST / "manifest.json")["templates/both.md"]["blob"]
        base = self.new / DIST / "history" / f"{base_blob}.blob"
        self.assertTrue(base.is_file(), "新包缺这个文件的基准原件，只能走保守路径")
        r = subprocess.run(["git", "merge-file", "-p", str(self.install / "templates/both.md"),
                            str(base), str(self.new / "templates/both.md")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, "不该有冲突")
        self.assertIn("第 2 行（官方改的）", r.stdout)
        self.assertIn("第 18 行（我改的）", r.stdout)


if __name__ == "__main__":
    unittest.main()
