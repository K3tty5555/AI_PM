#!/usr/bin/env python3
"""知识沉淀队列预处理器（收尾对账计划 T1，2026-07-17 至 2026-07-20）。

背景：后台无头消费者直接分段 Read 原始 jsonl transcript，80 轮里 51 轮耗在读文件上、
一行都闭环不了（消费者会话 479ed334 实测）。本脚本在 hook 拉起消费者前跑一遍，
把每条 pending 行的增量对话确定性提取成小摘要（只留用户/助手正文，去 tool_use/
tool_result/thinking 噪音），消费者读摘要判断沉淀，不再碰原 transcript。

行为：加锁 enqueue 并给每行生成稳定 queue_id；按 capture-events 里的 queue_id ack
在同锁下压缩已消费行；对剩余区间生成
digests/<session>__<from>-<to>__part-N-of-M.md，单片不超 60KB、尾部不丢；最后清扫
无对应队列行的孤儿分片。区间语义与 hook 水位一致：按含 '"type":"user"' 的行计数，
取第 from+1 到 to 个用户行及其间的助手正文。
"""

from __future__ import annotations

import argparse
import datetime
import fcntl
import hashlib
import json
import os
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

USER_CAP = 1500      # 单条用户消息截断
ASSIST_CAP = 1200    # 单条助手消息截断
TOTAL_CAP = 60_000   # 单分片 UTF-8 字节上限（超出开新片，不丢尾）
COMPACT_JSON = {"ensure_ascii": False, "separators": (",", ":")}


def _row_id(row: dict) -> str:
    """队列行稳定 id：同一会话、原文和水位区间在重试时仍是同一份工作。"""
    raw = "\0".join((str(row["session"]), str(row["transcript"]),
                     str(int(row["from_count"])), str(int(row["to_count"]))))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _normalize_row(row: dict) -> dict:
    normalized = dict(row)
    normalized["from_count"] = int(normalized["from_count"])
    normalized["to_count"] = int(normalized["to_count"])
    normalized["queue_id"] = normalized.get("queue_id") or _row_id(normalized)
    return normalized


def make_queue_row(session: str, transcript: str, from_count: int, to_count: int,
                   ts: str | None = None) -> dict:
    row = {
        "ts": ts or datetime.datetime.now().strftime("%F %T"),
        "session": session,
        "transcript": transcript,
        "from_count": int(from_count),
        "to_count": int(to_count),
    }
    return _normalize_row(row)


@contextmanager
def _queue_lock(queue: Path):
    """enqueue 与压缩共用同一把 advisory lock，杜绝读改写覆盖并发 append。"""
    queue.parent.mkdir(parents=True, exist_ok=True)
    lock_path = queue.with_name(queue.name + ".lock")
    with lock_path.open("a+", encoding="utf-8") as lock:
        lock_path.chmod(0o600)
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def append_queue_row(queue: Path, row: dict) -> bool:
    """在锁内追加一整行；同 queue_id 已存在时幂等返回 False。"""
    row = _normalize_row(row)
    with _queue_lock(queue):
        if queue.exists():
            for line in queue.read_text(encoding="utf-8", errors="ignore").splitlines():
                try:
                    if _normalize_row(json.loads(line))["queue_id"] == row["queue_id"]:
                        return False
                except Exception:
                    continue
        with queue.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, **COMPACT_JSON) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        queue.chmod(0o600)
    return True


def _acknowledged_ids(events: Path) -> set[str]:
    acked: set[str] = set()
    if not events.exists():
        return acked
    for line in events.open(encoding="utf-8", errors="ignore"):
        try:
            event = json.loads(line)
        except Exception:
            continue
        queue_id = event.get("queue_id")
        if queue_id and event.get("outcome") in {"written", "merged", "skipped"}:
            acked.add(str(queue_id))
    return acked


def prepare_queue(queue: Path, events: Path) -> tuple[list[dict], int]:
    """在队列锁内给旧行补 id，并只压缩已有成功留痕的行。

    无法解析的原始行保留不动，宁可卡住人工处置，不静默丢数据。
    """
    acked = _acknowledged_ids(events)
    rows: list[dict] = []
    removed = 0
    with _queue_lock(queue):
        if not queue.exists():
            return rows, removed
        original = queue.read_text(encoding="utf-8", errors="ignore").splitlines()
        kept_lines: list[str] = []
        changed = False
        for line in original:
            try:
                row = _normalize_row(json.loads(line))
            except Exception:
                kept_lines.append(line)
                continue
            if row["queue_id"] in acked:
                removed += 1
                changed = True
                continue
            encoded = json.dumps(row, **COMPACT_JSON)
            kept_lines.append(encoded)
            rows.append(row)
            if encoded != line:
                changed = True
        if changed:
            fd, tmp_name = tempfile.mkstemp(prefix=queue.name + ".", suffix=".tmp", dir=queue.parent)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as fh:
                    if kept_lines:
                        fh.write("\n".join(kept_lines) + "\n")
                    fh.flush()
                    os.fsync(fh.fileno())
                os.chmod(tmp_name, 0o600)
                os.replace(tmp_name, queue)
            finally:
                if os.path.exists(tmp_name):
                    os.unlink(tmp_name)
    return rows, removed


def _texts(content) -> list[str]:
    """取正文 text 块；tool_use/tool_result/thinking 全丢弃。"""
    if isinstance(content, str):
        return [content] if content.strip() else []
    out = []
    if isinstance(content, list):
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text" and str(c.get("text", "")).strip():
                out.append(c["text"])
    return out


def _digest_entries(transcript: Path, from_count: int, to_count: int) -> list[str]:
    """提取区间内可读正文；只做单条消息截断，不在整个 range 上丢尾。"""
    entries, idx = [], 0
    with transcript.open(encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            is_user = '"type":"user"' in line
            if is_user:
                idx += 1
                if idx > to_count:
                    break
            if idx <= from_count:
                continue
            if not (is_user or '"type":"assistant"' in line):
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            msg = d.get("message") or {}
            role = "U#%d" % idx if d.get("type") == "user" else "A"
            cap = USER_CAP if role.startswith("U") else ASSIST_CAP
            for t in _texts(msg.get("content")):
                t = t.strip()
                if len(t) > cap:
                    t = t[:cap] + "……[截断]"
                entries.append(f"[{role}] {t}")
    return entries


def digest_range_parts(transcript: Path, from_count: int, to_count: int) -> list[str]:
    """range 过大时按消息边界分片，每片不超过 TOTAL_CAP，首尾全保留。"""
    chunks: list[str] = []
    current: list[str] = []
    current_size = 0
    for entry in _digest_entries(transcript, from_count, to_count):
        extra = len(entry.encode("utf-8")) + (2 if current else 0)
        if current and current_size + extra > TOTAL_CAP:
            chunks.append("\n\n".join(current))
            current = []
            current_size = 0
            extra = len(entry.encode("utf-8"))
        current.append(entry)
        current_size += extra
    if current:
        chunks.append("\n\n".join(current))
    return chunks or [""]


def digest_range(transcript: Path, from_count: int, to_count: int) -> str:
    """兼容旧调用；新的落盘路径使用 digest_range_parts() 分片。"""
    return "\n\n".join(digest_range_parts(transcript, from_count, to_count))


def run(queue: Path, outdir: Path, events: Path | None = None) -> int:
    outdir.mkdir(parents=True, exist_ok=True)
    expected = set()
    made = 0
    events = events or (Path.home() / ".ai-pm/knowledge/capture-events.jsonl")
    rows, removed = prepare_queue(queue, events)
    if rows:
        for row in rows:
            base = f"{row['session']}__{row['from_count']}-{row['to_count']}"
            src = Path(row.get("transcript", ""))
            if not src.is_file():
                # transcript 临时不可读时保留已生成分片，由消费者读存量或回退原文。
                expected.update(f.name for f in outdir.glob(f"{base}__part-*.md"))
                continue
            bodies = digest_range_parts(src, int(row["from_count"]), int(row["to_count"]))
            total_parts = len(bodies)
            for part_no, body in enumerate(bodies, 1):
                name = f"{base}__part-{part_no:03d}-of-{total_parts:03d}.md"
                expected.add(name)
                dst = outdir / name
                if dst.exists():
                    continue
                head = (f"# 会话增量摘要 queue_id={row['queue_id']} session={row['session']} "
                        f"range={row['from_count']}-{row['to_count']} "
                        f"part={part_no}/{total_parts}\n"
                        f"# 源: {src}（工具调用/结果已剔除，只含用户与助手正文）\n\n")
                dst.write_text(head + (body or "（本区间无用户/助手正文）") + "\n", encoding="utf-8")
                dst.chmod(0o600)
                made += 1
    swept = 0
    for f in outdir.glob("*.md"):
        if f.name not in expected:
            f.unlink()
            swept += 1
    print(f"digests: +{made} / swept {swept} / expected {len(expected)} / acked -{removed}")
    return 0


def selftest() -> int:
    import subprocess
    import tempfile
    import time
    compact = {"ensure_ascii": False, "separators": (",", ":")}  # 真实 transcript 是紧凑 jsonl，匹配口径同 hook grep
    def u(text): return json.dumps({"type": "user", "message": {"content": text}}, **compact)
    def utool(): return json.dumps({"type": "user", "message": {"content": [{"type": "tool_result", "content": "噪音"}]}}, **compact)
    def a(text): return json.dumps({"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "Bash"}, {"type": "text", "text": text}]}}, **compact)
    lines = [u("问题一"), a("答一"), utool(), a("答二"), u("问题三"), a("答三"), u("问题四"), a("答四")]
    with tempfile.TemporaryDirectory() as td:
        t = Path(td) / "t.jsonl"
        t.write_text("\n".join(lines) + "\n", encoding="utf-8")
        # 用户行计数=4（含 tool_result 行，与 hook grep -c 口径一致）；取 (1,3] = 第2、3个用户行
        got = digest_range(t, 1, 3)
        assert "问题一" not in got and "答一" not in got, got          # from 之前排除
        assert "噪音" not in got, got                                   # tool_result 剔除
        assert "答二" in got and "问题三" in got and "答三" in got, got  # 区间内用户+助手正文
        assert "问题四" not in got and "答四" not in got, got           # to 之后排除
        long = Path(td) / "long.jsonl"
        long.write_text(u("x" * 3000) + "\n", encoding="utf-8")
        assert "……[截断]" in digest_range(long, 0, 1)                  # 单条截断
        huge = Path(td) / "huge.jsonl"
        huge.write_text("\n".join(u(f"MSG-{i:02d}-" + "x" * 1490) for i in range(1, 61)) + "\n",
                        encoding="utf-8")
        chunks = digest_range_parts(huge, 0, 60)
        assert len(chunks) >= 2, len(chunks)                           # 总量超限要分片，不截尾
        assert all(len(chunk.encode("utf-8")) <= TOTAL_CAP for chunk in chunks), \
            [len(c.encode("utf-8")) for c in chunks]
        joined = "\n\n".join(chunks)
        assert "MSG-01-" in joined and "MSG-60-" in joined, "首尾消息必须都在"
        assert "摘要达总量上限截停" not in joined
        multibyte = Path(td) / "multibyte.jsonl"
        multibyte.write_text("\n".join(u(f"中文-{i:02d}-" + "汉" * 1490) for i in range(1, 31)) + "\n",
                             encoding="utf-8")
        multibyte_chunks = digest_range_parts(multibyte, 0, 30)
        assert len(multibyte_chunks) >= 2, len(multibyte_chunks)
        assert all(len(chunk.encode("utf-8")) <= TOTAL_CAP for chunk in multibyte_chunks), \
            [len(c.encode("utf-8")) for c in multibyte_chunks]
        assert "中文-01-" in "\n".join(multibyte_chunks) and "中文-30-" in "\n".join(multibyte_chunks)
        queue = Path(td) / "pending.jsonl"
        queue.write_text(json.dumps({"session": "s", "transcript": str(huge),
                                     "from_count": 0, "to_count": 60}, **compact) + "\n",
                         encoding="utf-8")
        outdir = Path(td) / "digests"
        run(queue, outdir, Path(td) / "no-events.jsonl")
        written = sorted(outdir.glob("s__0-60__part-*.md"))
        assert len(written) == len(chunks), [p.name for p in written]
        on_disk = "\n".join(p.read_text(encoding="utf-8") for p in written)
        assert "MSG-01-" in on_disk and "MSG-60-" in on_disk
        assert not (outdir / "s__0-60.md").exists(), "禁止回退为单文件截尾协议"
        queue2 = Path(td) / "queue-with-ids.jsonl"
        events = Path(td) / "capture-events.jsonl"
        row1 = make_queue_row("session-1", str(t), 0, 3, ts="2026-07-20 10:00:00")
        append_queue_row(queue2, row1)
        # 兼容上线前已排队的无 id 旧行：prepare 必须原地补 id，不丢行。
        legacy = {"ts": "2026-07-17 18:23:12", "session": "legacy", "transcript": str(t),
                  "from_count": 0, "to_count": 3}
        with queue2.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(legacy, **compact) + "\n")
        rows, removed = prepare_queue(queue2, events)
        assert removed == 0 and len(rows) == 2
        assert all(row.get("queue_id") for row in rows), rows
        assert len({row["queue_id"] for row in rows}) == 2
        # 消费者只追加 ack 留痕；下次 prepare 在锁内只压缩已 ack 行。
        events.write_text(json.dumps({"ts": "2026-07-20 10:01:00", "queue_id": rows[0]["queue_id"],
                                      "outcome": "skipped"}, **compact) + "\n", encoding="utf-8")
        remaining, removed = prepare_queue(queue2, events)
        assert removed == 1 and [row["session"] for row in remaining] == ["legacy"], remaining
        queue3 = Path(td) / "run-compacts.jsonl"
        events3 = Path(td) / "run-events.jsonl"
        done = make_queue_row("done", str(t), 0, 3, ts="2026-07-20 11:00:00")
        todo = make_queue_row("todo", str(t), 0, 3, ts="2026-07-20 11:01:00")
        append_queue_row(queue3, done)
        append_queue_row(queue3, todo)
        events3.write_text(json.dumps({"queue_id": done["queue_id"], "outcome": "merged"}, **compact) + "\n",
                           encoding="utf-8")
        outdir3 = Path(td) / "run-digests"
        run(queue3, outdir3, events3)
        persisted = [json.loads(line) for line in queue3.read_text(encoding="utf-8").splitlines()]
        assert [row["session"] for row in persisted] == ["todo"], persisted
        todo_files = sorted(outdir3.glob("todo__0-3__part-*.md"))
        assert todo_files and not list(outdir3.glob("done__*.md"))
        assert f"queue_id={todo['queue_id']}" in todo_files[0].read_text(encoding="utf-8")
        queue4 = Path(td) / "cli-enqueue.jsonl"
        enqueue_args = ["--enqueue", "--queue", str(queue4), "--session", "cli-session",
                        "--transcript", str(t), "--from-count", "0", "--to-count", "3",
                        "--ts", "2026-07-20 12:00:00"]
        assert main(enqueue_args) == 0
        assert main(enqueue_args) == 0  # 同区间重试必须幂等
        cli_rows = [json.loads(line) for line in queue4.read_text(encoding="utf-8").splitlines()]
        assert len(cli_rows) == 1 and cli_rows[0].get("queue_id"), cli_rows
        # 确定性竞态：先在测试进程持有队列锁，再同时排队 compact 与 enqueue。
        # 释放后两者无论谁先拿锁，新行都不能被 compact 的旧快照覆盖。
        queue5 = Path(td) / "race.jsonl"
        events5 = Path(td) / "race-events.jsonl"
        outdir5 = Path(td) / "race-digests"
        old = make_queue_row("old", str(t), 0, 3, ts="2026-07-20 13:00:00")
        append_queue_row(queue5, old)
        events5.write_text(json.dumps({"queue_id": old["queue_id"], "outcome": "skipped"}, **compact) + "\n",
                           encoding="utf-8")
        lock_path = queue5.with_name(queue5.name + ".lock")
        with lock_path.open("a+", encoding="utf-8") as held:
            fcntl.flock(held.fileno(), fcntl.LOCK_EX)
            compact_proc = subprocess.Popen([
                sys.executable, str(Path(__file__).resolve()), "--queue", str(queue5),
                "--events", str(events5), "--outdir", str(outdir5),
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            enqueue_proc = subprocess.Popen([
                sys.executable, str(Path(__file__).resolve()), "--enqueue", "--queue", str(queue5),
                "--session", "new", "--transcript", str(t), "--from-count", "0", "--to-count", "3",
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            time.sleep(0.2)
            assert compact_proc.poll() is None and enqueue_proc.poll() is None, "enqueue/compact 未共用队列锁"
            fcntl.flock(held.fileno(), fcntl.LOCK_UN)
        compact_out = compact_proc.communicate(timeout=5)
        enqueue_out = enqueue_proc.communicate(timeout=5)
        assert compact_proc.returncode == 0 and enqueue_proc.returncode == 0, (compact_out, enqueue_out)
        raced_rows = [json.loads(line) for line in queue5.read_text(encoding="utf-8").splitlines()]
        assert [row["session"] for row in raced_rows] == ["new"], raced_rows
    print("kc-digest selftest: OK")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="知识沉淀队列的加锁 enqueue / ack 压缩 / 摘要分片器")
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--enqueue", action="store_true")
    parser.add_argument("--queue", default=str(Path.home() / ".ai-pm/knowledge/pending.jsonl"))
    parser.add_argument("--events", default=str(Path.home() / ".ai-pm/knowledge/capture-events.jsonl"))
    parser.add_argument("--outdir", default=str(Path.home() / ".ai-pm/knowledge/work/digests"))
    parser.add_argument("--session")
    parser.add_argument("--transcript")
    parser.add_argument("--from-count", type=int)
    parser.add_argument("--to-count", type=int)
    parser.add_argument("--ts")
    args = parser.parse_args(argv)
    if args.selftest:
        return selftest()
    queue = Path(args.queue)
    if args.enqueue:
        missing = [name for name, value in (("--session", args.session), ("--transcript", args.transcript),
                                             ("--from-count", args.from_count), ("--to-count", args.to_count))
                   if value is None]
        if missing:
            parser.error("--enqueue 缺参数: " + ", ".join(missing))
        row = make_queue_row(args.session, args.transcript, args.from_count, args.to_count, ts=args.ts)
        added = append_queue_row(queue, row)
        print(f"queued: {'added' if added else 'exists'} id={row['queue_id']}")
        return 0
    return run(queue, Path(args.outdir), Path(args.events))


if __name__ == "__main__":
    sys.exit(main())
