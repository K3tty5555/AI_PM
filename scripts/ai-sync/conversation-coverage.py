#!/usr/bin/env python3
"""Report whether a conversation index covers an explicit target date range."""

from __future__ import annotations

import argparse
import calendar
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INDEX = ROOT / ".ai-shared" / "conversations" / "index.jsonl"


def parse_date(value: Any) -> dt.date | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return dt.datetime.fromtimestamp(value, dt.timezone.utc).date()
    text = str(value).strip().replace("Z", "+00:00")
    try:
        return dt.datetime.fromisoformat(text).date()
    except ValueError:
        try:
            return dt.date.fromisoformat(text[:10])
        except ValueError:
            return None


def month_keys(start: dt.date, end: dt.date) -> list[str]:
    keys: list[str] = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        keys.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            year += 1
            month = 1
    return keys


def load_records(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise ValueError(f"conversation index 不存在: {path}") from exc
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"conversation index JSON 错误: {path}:{number}: {exc.msg}") from exc
        if isinstance(row, dict):
            records.append(row)
    return records


def assess_coverage(
    records: list[dict[str, Any]], start: dt.date, end: dt.date, sources: set[str]
) -> dict[str, Any]:
    if start > end:
        raise ValueError("--from 不能晚于 --to")
    filtered = [row for row in records if row.get("source") in sources]
    intervals: list[tuple[dt.date, dt.date, dict[str, Any]]] = []
    for row in filtered:
        first = parse_date(row.get("first_ts")) or parse_date(row.get("last_ts"))
        last = parse_date(row.get("last_ts")) or first
        if first and last:
            intervals.append((min(first, last), max(first, last), row))
    target_months = month_keys(start, end)
    covered_months: set[str] = set()
    target_intervals: list[tuple[dt.date, dt.date, dict[str, Any]]] = []
    for first, last, row in intervals:
        overlap_start = max(first, start)
        overlap_end = min(last, end)
        if overlap_start <= overlap_end:
            target_intervals.append((first, last, row))
            covered_months.update(month_keys(overlap_start, overlap_end))
    earliest = min((first for first, _, _ in intervals), default=None)
    latest = max((last for _, last, _ in intervals), default=None)
    missing_months = [month for month in target_months if month not in covered_months]
    boundary_gaps: list[str] = []
    if earliest is None:
        boundary_gaps.append("索引中没有目标来源的可解析会话时间")
    else:
        if earliest > start:
            boundary_gaps.append(f"索引最早 {earliest.isoformat()}，晚于目标起点 {start.isoformat()}")
        if latest is not None and latest < end:
            boundary_gaps.append(f"索引最晚 {latest.isoformat()}，早于目标终点 {end.isoformat()}")
    source_stats: dict[str, dict[str, Any]] = {}
    for source in sorted(sources):
        source_intervals = [(a, b, row) for a, b, row in intervals if row.get("source") == source]
        source_stats[source] = {
            "sessions": len(source_intervals),
            "earliest": min((a for a, _, _ in source_intervals), default=None),
            "latest": max((b for _, b, _ in source_intervals), default=None),
        }
        for key in ("earliest", "latest"):
            value = source_stats[source][key]
            source_stats[source][key] = value.isoformat() if value else None
    complete = not boundary_gaps and not missing_months
    return {
        "target": {"from": start.isoformat(), "to": end.isoformat(), "sources": sorted(sources)},
        "status": "index-bounds-complete" if complete else "coverage-gap",
        "sessions": len(target_intervals),
        "indexed_sessions": len(intervals),
        "earliest": earliest.isoformat() if earliest else None,
        "latest": latest.isoformat() if latest else None,
        "covered_months": sorted(covered_months),
        "missing_months": missing_months,
        "boundary_gaps": boundary_gaps,
        "source_stats": source_stats,
        "limit": "只证明索引时间边界和月份有会话，不证明语义材料完整；摘要缺失需另算",
    }


def render(report: dict[str, Any]) -> str:
    lines = [
        f"覆盖状态：{report['status']}",
        f"目标范围：{report['target']['from']} → {report['target']['to']}（来源: {', '.join(report['target']['sources'])}）",
        f"索引范围：{report['earliest'] or '无'} → {report['latest'] or '无'}（总计 {report['indexed_sessions']} 会话）",
        f"目标区间命中：{report['sessions']} 会话",
        f"覆盖月份：{', '.join(report['covered_months']) or '无'}",
    ]
    if report["missing_months"]:
        lines.append(f"缺失月份：{', '.join(report['missing_months'])}")
    for gap in report["boundary_gaps"]:
        lines.append(f"GAP: {gap}")
    lines.append(f"边界：{report['limit']}")
    return "\n".join(lines) + "\n"


def selftest() -> int:
    records = [
        {"source": "claude", "first_ts": "2026-07-03T10:00:00+08:00", "last_ts": "2026-07-10T20:00:00+08:00"},
        {"source": "codex", "first_ts": "2026-07-05T10:00:00+08:00", "last_ts": "2026-07-08T20:00:00+08:00"},
    ]
    july = assess_coverage(records, dt.date(2026, 7, 3), dt.date(2026, 7, 10), {"claude", "codex"})
    assert july["status"] == "index-bounds-complete", july
    july_aug = assess_coverage(records, dt.date(2026, 7, 1), dt.date(2026, 8, 10), {"claude", "codex"})
    assert july_aug["status"] == "coverage-gap", july_aug
    assert "2026-08" in july_aug["missing_months"], july_aug
    assert any("目标终点" in gap for gap in july_aug["boundary_gaps"]), july_aug
    assert july_aug["sessions"] == 2 and july_aug["indexed_sessions"] == 2, july_aug
    print("conversation-coverage selftest: OK（目标月份缺失不会因索引刚重建而假绿）")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", default=str(DEFAULT_INDEX))
    parser.add_argument("--from", dest="date_from")
    parser.add_argument("--to", dest="date_to")
    parser.add_argument("--source", action="append", choices=["claude", "codex"])
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.date_from or not args.date_to:
        parser.error("--from and --to are required")
    try:
        start = dt.date.fromisoformat(args.date_from)
        end = dt.date.fromisoformat(args.date_to)
        report = assess_coverage(load_records(Path(args.index)), start, end, set(args.source or ["claude", "codex"]))
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        sys.stdout.write(render(report))
    return 1 if args.strict and report["status"] != "index-bounds-complete" else 0


if __name__ == "__main__":
    raise SystemExit(main())
