#!/usr/bin/env python3
"""Create editable summary templates for AI conversation snapshots."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CONV_DIR = ROOT / ".ai-shared" / "conversations"
INDEX = CONV_DIR / "index.jsonl"


def load_records() -> list[dict]:
    if not INDEX.exists():
        raise SystemExit("Conversation index not found. Run scripts/ai-sync/build-conversation-index.py first.")
    records: list[dict] = []
    with INDEX.open(encoding="utf-8") as f:
        for line in f:
            records.append(json.loads(line))
    return records


def write_template(record: dict, overwrite: bool = False) -> bool:
    out = ROOT / record["summary"]
    if out.exists() and not overwrite:
        return False
    out.parent.mkdir(parents=True, exist_ok=True)
    snippets = "\n".join(
        f"- {item['role']}: {item['text']}" for item in record.get("snippets", [])
    ) or "- 暂无可抽取片段"
    content = f"""# {record.get('title') or record['session_id']}

- source: {record['source']}
- session_id: {record['session_id']}
- raw_file: `{record['file']}`
- time_range: {record.get('first_ts') or ''} — {record.get('last_ts') or ''}
- generated_at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- status: draft

## 本轮目标

待补充。

## 关键决策

待补充。

## 已完成

待补充。

## 涉及文件

待补充。

## 待跟进

待补充。

## 可沉淀为长期 Memory

待补充。确认后再写入 `.ai-shared/pending-memory/`。

## 自动抽取片段

{snippets}
"""
    out.write_text(content, encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--missing", action="store_true", help="create templates for records without summaries")
    parser.add_argument("--source", choices=["claude", "codex"], help="limit by source")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    records = load_records()
    if args.source:
        records = [r for r in records if r["source"] == args.source]
    if args.missing:
        records = [r for r in records if not r.get("summary_exists")]
    records = records[: args.limit]

    count = 0
    for record in records:
        if write_template(record, args.overwrite):
            count += 1
    print(f"Wrote {count} summary templates")


if __name__ == "__main__":
    main()
