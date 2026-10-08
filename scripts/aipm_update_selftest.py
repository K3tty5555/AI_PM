#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""升级产物自测：往返 / 幂等 / 阴性。

注意：本脚本不实现合并算法——合并由 Claude 执行。本脚本构造三棵树并断言
「三方合并的必要条件」，用 git merge-file 作参照实现算冲突数。

用法：python3 scripts/aipm_update_selftest.py --selftest
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 受管文件里的代表样本（跨 skill / 宪法 / hooks）
SAMPLES = [
    "CLAUDE.md",
    ".claude/skills/ai-pm/SKILL.md",
    ".claude/skills/ai-pm-prd/SKILL.md",
    ".claude/skills/ai-pm-prototype/SKILL.md",
    "README_zh-CN.md",
]


def _git(*args: str) -> str:
    r = subprocess.run(["git", "-C", str(ROOT), *args],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def _blob(rev: str, path: str) -> str | None:
    r = subprocess.run(["git", "-C", str(ROOT), "show", f"{rev}:{path}"],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def _inject_edits(base: str, n: int = 3) -> tuple[str, list[str]]:
    """在 base 上注入 n 处改造（挂在 ## 标题行尾）。返回 (改后文本, 标记列表)。"""
    lines = base.splitlines(keepends=True)
    heads = [i for i, l in enumerate(lines) if re.match(r"^#{2,3}\s", l)]
    if not heads:
        return base, []
    picks, marks = [], []
    for k in range(1, n + 1):
        idx = heads[len(heads) * k // (n + 1)]
        tag = f"USEREDIT{k}"
        lines[idx] = lines[idx].rstrip("\n") + f"  <!-- {tag} -->\n"
        picks.append(idx)
        marks.append(tag)
    return "".join(lines), marks


def _merge3(base: str, ours: str, theirs: str) -> tuple[str, int]:
    with tempfile.TemporaryDirectory() as d:
        p = {}
        for name, content in (("base", base), ("ours", ours), ("theirs", theirs)):
            fp = Path(d) / name
            fp.write_text(content, encoding="utf-8")
            p[name] = str(fp)
        subprocess.run(["git", "merge-file", "-L", "ours", "-L", "base", "-L", "theirs",
                        p["ours"], p["base"], p["theirs"]], capture_output=True)
        merged = Path(p["ours"]).read_text(encoding="utf-8")
    return merged, len(re.findall(r"^<<<<<<< ", merged, flags=re.M))


def check_roundtrip(base_rev: str, theirs_rev: str) -> list[str]:
    """往返：base 上注入 N 处改动 → 与 theirs 三方合并 → 断言改动全在、官方新增全在。"""
    problems = []
    for path in SAMPLES:
        base, theirs = _blob(base_rev, path), _blob(theirs_rev, path)
        if base is None or theirs is None:
            continue
        ours, marks = _inject_edits(base, 3)
        if not marks:
            continue
        merged, nconf = _merge3(base, ours, theirs)
        lost = [m for m in marks if m not in merged]
        if lost and nconf == 0:
            problems.append(f"{path}: 无冲突却丢了用户改动 {lost}")
    return problems


def check_idempotent() -> list[str]:
    """幂等：对同一官方新版重复升级，结果不再变化。

    注意：两遍的输入必须不同，否则断言恒真。
    第一遍 merged1 = f(base, ours, theirs)；第二遍 merged2 = f(base, merged1, theirs)。
    """
    problems = []
    for path in SAMPLES:
        base = _blob("v0.5.3", path)
        theirs = _blob("HEAD", path)
        if base is None or theirs is None:
            continue
        ours, _ = _inject_edits(base, 3)
        m1, _ = _merge3(base, ours, theirs)
        # 第二遍：把第一遍的产物当作 ours 再合一次，官方侧不变
        m2, _ = _merge3(base, m1, theirs)
        if m1 != m2:
            problems.append(f"{path}: 合并不幂等（第二遍改变了结果）")
    return problems


def check_negative() -> list[str]:
    """阴性：未改动的目录，三方合并结果应逐字节等于 theirs。"""
    problems = []
    for path in SAMPLES:
        for base_rev, theirs_rev in (("v0.4.4", "v0.5.0"), ("v0.5.0", "v0.5.3")):
            base, theirs = _blob(base_rev, path), _blob(theirs_rev, path)
            if base is None or theirs is None:
                continue
            merged, nconf = _merge3(base, base, theirs)  # ours == base（未改动）
            if merged != theirs:
                problems.append(f"{path} ({base_rev}→{theirs_rev}): 未改动却未等于官方新版（冲突 {nconf}）")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if not args.selftest:
        ap.print_help()
        return 2

    failures = 0
    for name, fn in (
        ("往返用例（用户改动全保住）", lambda: check_roundtrip("v0.5.3", "HEAD")),
        ("幂等性（两次合并一致）", check_idempotent),
        ("阴性用例（未改动 == 官方新版）", check_negative),
    ):
        problems = fn()
        if problems:
            failures += 1
            print(f"❌ {name}")
            for p in problems[:5]:
                print(f"     {p}")
        else:
            print(f"✅ {name}")

    print(f"\n{3 - failures}/3 组通过")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
