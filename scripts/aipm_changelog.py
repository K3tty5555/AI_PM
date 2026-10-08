#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 git 历史生成/追加 CHANGELOG.md。

用法：
    python3 scripts/aipm_changelog.py --since v0.5.3 --version v0.6.0 --write
    python3 scripts/aipm_changelog.py --since v0.5.3            # 只打印
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _git_log(since: str) -> list[tuple[str, str, str]]:
    """返回 [(短 sha, 日期, 主题)]，按时间正序。"""
    out = subprocess.run(
        ["git", "-C", str(ROOT), "log", "--reverse",
         "--format=%h\t%ad\t%s", "--date=short", f"{since}..HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout
    rows = []
    for line in out.splitlines():
        parts = line.split("\t", 2)
        if len(parts) == 3:
            rows.append((parts[0], parts[1], parts[2]))
    return rows


def render(since: str, version: str) -> str:
    rows = _git_log(since)
    lines = [f"## {version}  ({time.strftime('%Y-%m-%d')})", "",
             f"自 `{since}` 起共 {len(rows)} 次改动。", ""]
    for sha, date, subject in rows:
        lines.append(f"- {date} `{sha}` {subject}")
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    block = render(args.since, args.version)
    if not args.write:
        print(block)
        return 0

    path = ROOT / "CHANGELOG.md"
    existing = path.read_text(encoding="utf-8") if path.is_file() else "# AI_PM 更新日志\n\n"
    header, _, body = existing.partition("\n\n")
    path.write_text(f"{header}\n\n{block}\n{body.lstrip()}", encoding="utf-8")
    print(f"✅ 已写入 {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
