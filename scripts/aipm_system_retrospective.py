#!/usr/bin/env python3
"""Build a read-only AI_PM system retrospective from indexes and summaries."""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
CONVERSATIONS = ROOT / ".ai-shared" / "conversations"
INDEX = CONVERSATIONS / "index.jsonl"
PENDING = ROOT / ".ai-shared" / "pending-memory"
CORRECTION_SIGNALS = {
    "事实/范围纠正": re.compile(r"纠正|不对|范围.*删|残留|误解"),
    "口径纠正": re.compile(r"口径|分子|分母|指标.*改"),
    "产物返工": re.compile(r"返工|漏掉|遗漏|重写|覆盖"),
    "触发/鲜度": re.compile(r"未触发|假绿|freshness|水位|覆盖缺口", re.I),
}


def _coverage_module():
    path = ROOT / "scripts" / "ai-sync" / "conversation-coverage.py"
    spec = importlib.util.spec_from_file_location("aipm_conversation_coverage", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"无法加载 coverage 模块: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_report(start: dt.date, end: dt.date, sources: set[str]) -> dict[str, Any]:
    coverage_module = _coverage_module()
    records = coverage_module.load_records(INDEX)
    coverage = coverage_module.assess_coverage(records, start, end, sources)
    target_records = []
    for row in records:
        if row.get("source") not in sources:
            continue
        first = coverage_module.parse_date(row.get("first_ts") or row.get("last_ts"))
        last = coverage_module.parse_date(row.get("last_ts") or row.get("first_ts"))
        if first and last and max(first, start) <= min(last, end):
            target_records.append(row)

    summary_missing = 0
    summary_draft = 0
    signal_counts = {name: 0 for name in CORRECTION_SIGNALS}
    scanned_summaries = 0
    for row in target_records:
        summary_ref = row.get("summary")
        if not row.get("summary_exists") or not summary_ref:
            summary_missing += 1
            continue
        path = ROOT / str(summary_ref)
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            summary_missing += 1
            continue
        scanned_summaries += 1
        if "status: draft" in text[:800]:
            summary_draft += 1
        for name, pattern in CORRECTION_SIGNALS.items():
            if pattern.search(text):
                signal_counts[name] += 1

    pending_count = 0
    if PENDING.is_dir():
        pending_count = sum(1 for path in PENDING.glob("*.md") if path.name != "README.md")
    improvement_candidates: list[dict[str, str]] = []
    if coverage["status"] != "index-bounds-complete":
        improvement_candidates.append({
            "id": "refresh-context-index",
            "reason": "目标时间范围存在索引边界或月份缺口",
            "action": "由用户确认后运行 sync-ai-context，并重新生成 coverage；不要把本次报告当完整回顾",
        })
    if summary_missing or summary_draft:
        improvement_candidates.append({
            "id": "complete-summaries",
            "reason": f"目标会话摘要缺失 {summary_missing}、draft {summary_draft}",
            "action": "显式补摘要后重跑 system retrospective；未补前只讨论已扫描材料",
        })
    signal_actions = {
        "事实/范围纠正": "抽查 baseline 与 reconcile 是否在同类任务前触发",
        "口径纠正": "抽查 rate 指标的分子、分母、版本和来源是否齐全",
        "产物返工": "抽查产物登记、dependencies 与 PRD/原型写前契约",
        "触发/鲜度": "抽查目标区间 coverage 与 freshness 的 N/A/红灯语义",
    }
    for name, count in signal_counts.items():
        if count:
            improvement_candidates.append({
                "id": "review-" + name.replace("/", "-"),
                "reason": f"{name}候选信号命中 {count} 份摘要；关键词命中不等于根因",
                "action": signal_actions[name] + "，经人工确认后再改规则或 memory",
            })
    if pending_count:
        improvement_candidates.append({
            "id": "review-pending-memory",
            "reason": f"pending-memory 有 {pending_count} 份待确认材料",
            "action": "逐份确认、合并或驳回，不自动覆盖 Claude memory 主源",
        })
    return {
        "schema_version": 1,
        "generated_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "coverage": coverage,
        "summary_quality": {
            "target_sessions": len(target_records),
            "summaries_scanned": scanned_summaries,
            "summary_missing": summary_missing,
            "summary_draft": summary_draft,
        },
        "correction_signal_candidates": signal_counts,
        "improvement_candidates": improvement_candidates,
        "pending_memory": pending_count,
        "data_boundary": [
            "只读取 conversation index 与脱敏 summary，不读取或复制 raw",
            "关键词计数只用于定位候选，不等于原因结论",
            "覆盖边界通过不代表语义摘要完整，summary_missing/draft 必须同时看",
            "输出是待确认改进，不直接写项目 L0/L1 或 Claude memory",
        ],
    }


def render(report: dict[str, Any]) -> str:
    coverage = report["coverage"]
    quality = report["summary_quality"]
    lines = [
        "# AI_PM System Retrospective Preview",
        "",
        f"- 目标范围：{coverage['target']['from']} → {coverage['target']['to']}",
        f"- 索引覆盖：{coverage['status']}（目标区间 {coverage['sessions']} / 索引总计 {coverage['indexed_sessions']} 会话）",
        f"- 摘要：扫描 {quality['summaries_scanned']} / 缺失 {quality['summary_missing']} / draft {quality['summary_draft']}",
        f"- pending-memory：{report['pending_memory']}",
        "",
        "## 覆盖缺口",
        "",
    ]
    gaps = coverage["boundary_gaps"] + ([f"缺失月份: {', '.join(coverage['missing_months'])}"] if coverage["missing_months"] else [])
    lines.extend(f"- {gap}" for gap in gaps)
    if not gaps:
        lines.append("- 索引时间边界与目标月份均有覆盖；仍需看摘要缺失和 draft。")
    lines.extend(["", "## 纠错候选信号", ""])
    for name, count in report["correction_signal_candidates"].items():
        lines.append(f"- {name}: {count} 份摘要命中")
    lines.extend(["", "## 待确认改进", ""])
    for item in report["improvement_candidates"]:
        lines.append(f"- `{item['id']}`：{item['reason']}；{item['action']}")
    if not report["improvement_candidates"]:
        lines.append("- 暂无机械候选；不代表系统无需改进。")
    lines.extend(["", "## 数据边界", ""])
    lines.extend(f"- {item}" for item in report["data_boundary"])
    return "\n".join(lines) + "\n"


def selftest() -> int:
    module = _coverage_module()
    records = [{"source": "claude", "first_ts": "2026-07-01", "last_ts": "2026-07-31"}]
    report = module.assess_coverage(records, dt.date(2026, 7, 1), dt.date(2026, 8, 10), {"claude"})
    assert report["status"] == "coverage-gap", report
    assert "2026-08" in report["missing_months"], report
    sample = {
        "coverage": report,
        "summary_quality": {"summaries_scanned": 0, "summary_missing": 0, "summary_draft": 0},
        "pending_memory": 0,
        "correction_signal_candidates": {},
        "improvement_candidates": [{
            "id": "refresh-context-index",
            "reason": "coverage gap",
            "action": "确认后同步",
        }],
        "data_boundary": ["只读"],
    }
    assert "待确认改进" in render(sample), render(sample)
    print("aipm_system_retrospective selftest: OK（只读索引边界）")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
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
        report = build_report(
            dt.date.fromisoformat(args.date_from),
            dt.date.fromisoformat(args.date_to),
            set(args.source or ["claude", "codex"]),
        )
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        sys.stdout.write(render(report))
    quality = report["summary_quality"]
    incomplete = report["coverage"]["status"] != "index-bounds-complete" or quality["summary_missing"] or quality["summary_draft"]
    return 1 if args.strict and incomplete else 0


if __name__ == "__main__":
    raise SystemExit(main())
