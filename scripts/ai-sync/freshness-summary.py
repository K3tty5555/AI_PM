#!/usr/bin/env python3
"""鲜度欠账一行汇总（A0，2026-07-03 第三阶段主计划）。

覆盖三层：会话摘要缺口（缺失 ∪ 空 draft）/ pending-memory 积压 / context 三文件超龄。
只打数字和日期，不打会话标题、卡片标题（隐私）；无欠账时不输出、退出码 0。
接点：check-ai-context-freshness.sh 末尾（session-start 兜底）+ /ai-pm 冷启动步骤（承重）+ 周报。
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONV = ROOT / ".ai-shared" / "conversations"
INDEX = CONV / "index.jsonl"
PENDING = ROOT / ".ai-shared" / "pending-memory"
CONTEXT_FILES = [
    ROOT / ".ai-shared" / "context" / "project-current-state.md",
    ROOT / ".ai-shared" / "context" / "open-questions.md",
    ROOT / ".ai-shared" / "context" / "product-decisions.md",
]
MEMORY_DIR = Path.home() / ".claude" / "projects" / str(ROOT).replace("/", "-").replace("_", "-") / "memory"

# 阈值（主计划 A0/A1/A2/A3 拍定）
SUMMARY_GAP_ALERT = 5      # 摘要缺口 > 5 条才报
PENDING_AGE_ALERT = 14     # pending 最老 > 14 天才报（>0 份即计数）
CONTEXT_AGE_ALERT = 14     # context 超 14 天未更才报
DEBTS_AGE_ALERT = 7        # 计划债台账 updated 超 7 天提醒对账（2026-07-17 收尾对账计划 T2）
DEBTS = ROOT / "docs" / "_plan-debts.json"


def summary_gap() -> tuple[int, str]:
    """缺口 = summary_exists=False ∪ (存在但 status: draft)。返回 (数量, 索引截至日)。"""
    if not INDEX.exists():
        return -1, ""
    gap = 0
    latest_ts = ""
    for line in INDEX.open(encoding="utf-8"):
        try:
            r = json.loads(line)
        except Exception:
            continue
        ts = r.get("last_ts") or ""
        if ts > latest_ts:
            latest_ts = ts
        if not r.get("summary_exists"):
            gap += 1
            continue
        p = ROOT / r["summary"]
        try:
            if p.exists() and "status: draft" in p.read_text(encoding="utf-8")[:600]:
                gap += 1
        except Exception:
            gap += 1
    return gap, latest_ts[:10]


def pending_backlog() -> tuple[int, int]:
    """返回 (份数, 最老天数)。README 不算。"""
    if not PENDING.is_dir():
        return 0, 0
    files = [p for p in PENDING.iterdir() if p.suffix == ".md" and p.name != "README.md"]
    if not files:
        return 0, 0
    oldest = min(p.stat().st_mtime for p in files)
    return len(files), int((time.time() - oldest) / 86400)


def _index_latest_activity() -> float:
    """conversation index 中最新会话活动的 epoch，不用索引文件自身 mtime。"""
    import datetime

    if not INDEX.exists():
        return 0.0
    latest = 0.0
    for line in INDEX.open(encoding="utf-8", errors="ignore"):
        try:
            row = json.loads(line)
            value = row.get("last_ts") or row.get("first_ts") or ""
            if isinstance(value, (int, float)):
                stamp = float(value)
            else:
                stamp = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
            latest = max(latest, stamp)
        except Exception:
            continue
    return latest


def context_age() -> int:
    """context 三文件相对最新会话活动的最大滞后天数。

    索引/raw 都是本地快照，同步时可被重建/重拷；它们的 mtime 不等于会话活动时间。
    只在索引内没有可解析时间时，才回退 raw mtime。
    """
    baseline = _index_latest_activity()
    if baseline <= 0:
        raw = CONV / "raw"
        if raw.is_dir():
            for p in raw.rglob("*.jsonl"):
                baseline = max(baseline, p.stat().st_mtime)
    worst = 0
    for f in CONTEXT_FILES:
        if not f.exists():
            continue
        lag_days = int((baseline - f.stat().st_mtime) / 86400)
        worst = max(worst, lag_days)
    return worst


def memory_status() -> tuple[int, int]:
    """滚动状态卡（project_* 且名含 status/roadmap/current）超龄计数（A7 · K1 段1）。
    卡龄优先用卡内机读字段 `last-verified: YYYY-MM-DD`（比 mtime 准——mtime 会被 backup 刷），
    无则退回 mtime；带 `superseded-by` 的冻结卡不计入活跃状态卡鲜度。
    排除 feedback_/pitfall_/reference_（铁律/踩坑不滚动）。
    「两活卡口径打架」的语义冲突对不机器算（需人工判，A7 处置人工拍）。
    memory 在仓外 ~/.claude/projects/<slug>/memory；派生不到则静默跳过（跨机不报错）。"""
    import re
    import datetime
    mem = MEMORY_DIR
    if not mem.is_dir():
        return 0, 0
    n, worst = 0, 0
    for f in mem.glob("*.md"):
        if f.name == "MEMORY.md" or not f.name.startswith("project"):
            continue
        if not re.search(r"status|roadmap|current", f.name, re.I):
            continue
        try:
            txt = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if re.search(r"^superseded-by:\s*\S+", txt, re.M):
            continue
        m = re.search(r"^last-verified:\s*(\d{4}-\d{2}-\d{2})", txt, re.M)
        age = None
        if m:
            try:
                age = (datetime.date.today() - datetime.date.fromisoformat(m.group(1))).days
            except Exception:
                age = None
        if age is None:
            age = int((time.time() - f.stat().st_mtime) / 86400)
        if age > CONTEXT_AGE_ALERT:
            n += 1
            worst = max(worst, age)
    return n, worst


def debts_age() -> tuple[int, int]:
    """计划债台账年龄：updated 字段距今天数。「清一条删一条」靠人记不住（07-17 实证：
    扳机已响 4 天未销账），这里只报年龄提醒对账、不判单条扳机（机读化太重）。
    返回 (天数, 债条数)；台账缺失/解析失败静默跳过。"""
    import datetime
    if not DEBTS.exists():
        return -1, 0
    try:
        data = json.loads(DEBTS.read_text(encoding="utf-8"))
        age = (datetime.date.today() - datetime.date.fromisoformat(data.get("updated", ""))).days
        return age, len(data.get("debts", []))
    except Exception:
        return -1, 0


def selftest() -> int:
    """索引文件刚重建时，context 年龄仍应按索引内最新会话活动计算。"""
    import datetime
    import tempfile

    global INDEX, CONV, CONTEXT_FILES, MEMORY_DIR
    saved = INDEX, CONV, CONTEXT_FILES, MEMORY_DIR
    try:
        with tempfile.TemporaryDirectory(prefix="aipm-freshness-selftest-") as raw:
            root = Path(raw)
            conv = root / "conversations"
            raw_dir = conv / "raw" / "claude"
            context = root / "context"
            raw_dir.mkdir(parents=True)
            context.mkdir()
            index = conv / "index.jsonl"
            index.write_text(json.dumps({"last_ts": "2026-07-10T12:00:00+00:00"}) + "\n",
                             encoding="utf-8")
            raw_file = raw_dir / "old-session.jsonl"
            raw_file.write_text("{}\n", encoding="utf-8")
            files = [context / name for name in (
                "project-current-state.md", "open-questions.md", "product-decisions.md"
            )]
            for f in files:
                f.write_text("snapshot\n", encoding="utf-8")

            def epoch(day: int) -> float:
                return datetime.datetime(2026, 7, day, 12, tzinfo=datetime.timezone.utc).timestamp()

            # 模拟 7/20 同步：索引和 raw 副本 mtime 都被刷新，但会话实际只到 7/10；
            # context 7/3 相对真实活动只落后 7 天，不应被算成 17 天。
            os.utime(index, (epoch(20), epoch(20)))
            os.utime(raw_file, (epoch(20), epoch(20)))
            for f in files:
                os.utime(f, (epoch(3), epoch(3)))
            INDEX, CONV, CONTEXT_FILES = index, conv, files
            got = context_age()
            assert got == 7, f"context age 应按 last_ts 算 7 天，实际 {got} 天"

            memory = root / "memory"
            memory.mkdir()
            old_day = datetime.date.today() - datetime.timedelta(days=20)
            (memory / "project_active_status.md").write_text(
                f"---\nlast-verified: {old_day.isoformat()}\n---\n", encoding="utf-8"
            )
            (memory / "project_frozen_roadmap.md").write_text(
                f"---\nlast-verified: {old_day.isoformat()}\nsuperseded-by: project_active_status\n---\n",
                encoding="utf-8",
            )
            MEMORY_DIR = memory
            count, age = memory_status()
            assert count == 1 and age == 20, (
                f"冻结卡不应计入超龄，预期 1 张/20 天，实际 {count} 张/{age} 天"
            )
    finally:
        INDEX, CONV, CONTEXT_FILES, MEMORY_DIR = saved
    print("freshness-summary selftest: OK")
    return 0


def main() -> None:
    parts = []
    gap, idx_date = summary_gap()
    if gap > SUMMARY_GAP_ALERT:
        parts.append(f"摘要缺口 {gap}（含空 draft）")
    n_pending, age_pending = pending_backlog()
    if n_pending > 0 and age_pending > PENDING_AGE_ALERT:
        parts.append(f"pending-memory {n_pending} 份·最老 {age_pending} 天")
    elif n_pending > 0:
        parts.append(f"pending-memory {n_pending} 份待处置")
    ctx = context_age()
    if ctx > CONTEXT_AGE_ALERT:
        parts.append(f"context 最老 {ctx} 天未更")
    n_stale, age_stale = memory_status()
    if n_stale > 0:
        parts.append(f"状态卡超龄 {n_stale}（最老 {age_stale} 天）")
    d_age, d_n = debts_age()
    if d_age > DEBTS_AGE_ALERT:
        parts.append(f"计划债台账 {d_age} 天未对账（{d_n} 条，docs/_plan-debts.json）")
    if parts:
        tail = f"（索引截至 {idx_date}）" if idx_date else ""
        sys.stdout.buffer.write(
            ("⏳ 鲜度欠账：" + "｜".join(parts) + tail + "\n   处置：scripts/ai-sync/sync-ai-context.sh + 显式补摘要/清 pending\n").encode("utf-8")
        )


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUTF8", "1")
    if "--selftest" in sys.argv[1:]:
        raise SystemExit(selftest())
    main()
