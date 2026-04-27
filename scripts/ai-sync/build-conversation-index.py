#!/usr/bin/env python3
"""Build machine and human indexes for local AI conversation snapshots."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
CONV_DIR = ROOT / ".ai-shared" / "conversations"
RAW_DIR = CONV_DIR / "raw"
SUMMARY_DIR = CONV_DIR / "summaries"
OUT_JSONL = CONV_DIR / "index.jsonl"
OUT_MD = CONV_DIR / "conversation-index.md"

SECRET_RE = re.compile(
    r"(sk-[A-Za-z0-9_-]+|AKIA[0-9A-Z]{16}|[A-Za-z0-9_=-]{32,}|-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----)",
    re.S,
)


def redact(text: str) -> str:
    return SECRET_RE.sub("[REDACTED]", text)


def shorten(text: str, limit: int = 160) -> str:
    text = re.sub(r"\s+", " ", redact(text)).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def parse_ts(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc).isoformat()
    text = str(value)
    if not text:
        return ""
    return text


def content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
        return "\n".join(p for p in parts if p)
    if isinstance(content, dict):
        return str(content.get("text") or content.get("content") or "")
    return str(content)


def extract_message(obj: dict[str, Any], source: str) -> tuple[str, str]:
    if source == "claude":
        role = obj.get("type") if obj.get("type") in {"user", "assistant"} else ""
        msg = obj.get("message") or {}
        text = content_to_text(msg.get("content") if isinstance(msg, dict) else obj.get("content"))
        return role, text

    payload = obj.get("payload") or {}
    if obj.get("type") == "response_item" and isinstance(payload, dict):
        role = payload.get("role") if payload.get("role") in {"user", "assistant"} else ""
        text = content_to_text(payload.get("content"))
        return role, text
    if obj.get("type") == "event_msg" and isinstance(payload, dict):
        role = payload.get("role") if payload.get("role") in {"user", "assistant"} else ""
        text = content_to_text(payload.get("content"))
        return role, text
    if "text" in obj and "session_id" in obj:
        return "user", content_to_text(obj.get("text"))
    return "", ""


def summarize_file(path: Path, source: str) -> dict[str, Any]:
    first_ts = ""
    last_ts = ""
    line_count = 0
    user_count = 0
    assistant_count = 0
    first_user = ""
    snippets: list[dict[str, str]] = []
    session_id = path.stem

    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            line_count += 1
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            if source == "codex":
                payload = obj.get("payload") or {}
                if obj.get("type") == "session_meta" and isinstance(payload, dict):
                    session_id = payload.get("id") or session_id

            ts = parse_ts(obj.get("timestamp") or obj.get("ts"))
            if ts:
                first_ts = first_ts or ts
                last_ts = ts

            role, text = extract_message(obj, source)
            if not role or not text:
                continue
            if role == "user":
                user_count += 1
                first_user = first_user or shorten(text, 120)
            elif role == "assistant":
                assistant_count += 1
            if len(snippets) < 8 and role in {"user", "assistant"}:
                snippets.append({"role": role, "text": shorten(text, 180)})

    rel_raw = path.relative_to(ROOT).as_posix()
    summary_path = SUMMARY_DIR / source / f"{path.stem}.md"
    rel_summary = summary_path.relative_to(ROOT).as_posix()
    return {
        "source": source,
        "session_id": session_id,
        "file": rel_raw,
        "summary": rel_summary,
        "summary_exists": summary_path.exists(),
        "first_ts": first_ts,
        "last_ts": last_ts,
        "size_bytes": path.stat().st_size,
        "line_count": line_count,
        "user_messages": user_count,
        "assistant_messages": assistant_count,
        "title": first_user or path.stem,
        "snippets": snippets,
    }


def main() -> None:
    records: list[dict[str, Any]] = []
    for source in ("claude", "codex"):
        source_dir = RAW_DIR / source
        if not source_dir.exists():
            continue
        for path in sorted(source_dir.glob("*.jsonl")):
            records.append(summarize_file(path, source))

    records.sort(key=lambda r: (r.get("last_ts") or "", r["source"], r["file"]), reverse=True)
    OUT_JSONL.parent.mkdir(parents=True, exist_ok=True)
    with OUT_JSONL.open("w", encoding="utf-8") as out:
        for record in records:
            out.write(json.dumps(record, ensure_ascii=False) + "\n")

    lines = [
        "---",
        f"generated_at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S %z')}",
        "do_not_edit: true",
        "---",
        "",
        "# AI Conversation Index",
        "",
        "| 来源 | 时间 | 标题 | 原始副本 | 摘要 |",
        "|------|------|------|----------|------|",
    ]
    for record in records[:200]:
        summary = record["summary"] if record["summary_exists"] else "缺失"
        lines.append(
            "| {source} | {time} | {title} | `{file}` | {summary} |".format(
                source=record["source"],
                time=record["last_ts"] or record["first_ts"] or "",
                title=shorten(record["title"], 80).replace("|", "\\|"),
                file=record["file"],
                summary=f"`{summary}`" if summary != "缺失" else summary,
            )
        )
    lines.extend(
        [
            "",
            f"- indexed_sessions: {len(records)}",
            "- raw conversations are local snapshots and ignored by Git.",
            "- run `scripts/ai-sync/summarize-conversation.py --missing` to create missing summary templates.",
        ]
    )
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_JSONL}")
    print(f"Wrote {OUT_MD}")


if __name__ == "__main__":
    main()
