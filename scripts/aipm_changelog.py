#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 git 历史生成/追加 CHANGELOG.md。

用法：
    python3 scripts/aipm_changelog.py --since v0.5.3 --version v0.6.0 --write
    python3 scripts/aipm_changelog.py --since v0.5.3            # 只打印
    python3 scripts/aipm_changelog.py --since v0.5.3 --version v0.6.0 --force --write
    python3 scripts/aipm_changelog.py --since v0.5.3 --version v0.6.0 --date 2026-09-30 --write

约定（改动前先读）：
- 版本块标题格式固定为 `## {version}  ({date})`，该前缀同时是 `--write` 的幂等判据；
  改标题格式会让旧块再也认不出来、重跑就追加成两份。
- 日期优先取同名 tag 的提交日（补生成历史版本时才不会写成同一天），取不到回落生成日，
  两种来源都在 stderr 标注；`--date` 优先级最高。
- `--write` 发现同名版本块已存在时拒绝写盘（退出码 2），必须显式 `--force` 才覆盖该块。
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HEADER = "# AI_PM 更新日志\n\n"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True)


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


def resolve_date(version: str, override: str | None) -> tuple[str, str]:
    """返回 (日期, 来源说明)。优先 --date，其次同名 tag 的提交日，最后生成日。"""
    if override:
        return override, "--date 显式指定"
    tag = f"refs/tags/{version}^{{commit}}"
    if _git("rev-parse", "--verify", "--quiet", tag).returncode == 0:
        out = _git("log", "-1", "--format=%ad", "--date=short", version)
        date = out.stdout.strip()
        if out.returncode == 0 and DATE_RE.match(date):
            return date, f"tag {version} 的提交日"
    return time.strftime("%Y-%m-%d"), "生成日（未找到同名 tag，已回落）"


def render(since: str, version: str, date: str, source: str) -> str:
    rows = _git_log(since)
    lines = [f"## {version}  ({date})", "",
             f"自 `{since}` 起共 {len(rows)} 次改动。", ""]
    for sha, d, subject in rows:
        lines.append(f"- {d} `{sha}` {subject}")
    return "\n".join(lines).rstrip("\n")


def _block_span(text: str, version: str) -> tuple[int, int] | None:
    """定位 `## {version}  (` 块的 [start, end)；end 为下一个 `## ` 或文件末尾。"""
    m = re.search(rf"^## {re.escape(version)}  \(", text, re.M)
    if m is None:
        return None
    nxt = re.search(r"^## ", text[m.end():], re.M)
    return (m.start(), m.end() + nxt.start() if nxt else len(text))


def _insert(text: str, block: str) -> str:
    """把 block 插在文件第一个版本块之前；没有版本块就追加到末尾。头部内容整段保留。"""
    m = re.search(r"^## ", text, re.M)
    if m is None:
        base = text.rstrip("\n")
        return f"{base}\n\n{block}\n" if base else f"{block}\n"
    head = text[:m.start()].rstrip("\n")
    tail = text[m.start():]
    return f"{head}\n\n{block}\n\n{tail}" if head else f"{block}\n\n{tail}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="同名版本块已存在时覆盖它（默认拒绝写盘）")
    ap.add_argument("--date", help="显式指定版本块日期（YYYY-MM-DD），覆盖 tag 与生成日")
    args = ap.parse_args()

    if args.date and not DATE_RE.match(args.date):
        print(f"⛔ --date 需要 YYYY-MM-DD 格式，收到 {args.date!r}", file=sys.stderr)
        return 2

    date, source = resolve_date(args.version, args.date)
    print(f"ℹ️  日期来源：{source} → {date}", file=sys.stderr)
    block = render(args.since, args.version, date, source)

    if not args.write:
        print(block)
        return 0

    path = ROOT / "CHANGELOG.md"
    existing = path.read_text(encoding="utf-8") if path.is_file() else DEFAULT_HEADER
    span = _block_span(existing, args.version)
    if span and not args.force:
        print(f"⛔ CHANGELOG.md 里已有 {args.version} 的版本块，拒绝重复写入。", file=sys.stderr)
        print("   确认要覆盖该块再加 --force；只看内容就去掉 --write。", file=sys.stderr)
        return 2

    if span:
        text = f"{existing[:span[0]]}{block}\n\n{existing[span[1]:]}"
        verb = "已覆盖"
    else:
        text = _insert(existing, block)
        verb = "已写入"

    path.write_text(text.rstrip("\n") + "\n", encoding="utf-8")
    print(f"✅ {verb} {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
