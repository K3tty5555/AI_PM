#!/usr/bin/env python3
"""knowledge-capture.sh 的隔离集成自测：双 Stop 单飞 + queue id/ack prompt。"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOOK = ROOT / ".claude/hooks/knowledge-capture.sh"
DIGEST = ROOT / "scripts/kc-digest.py"


def _transcript(path: Path, prefix: str) -> None:
    compact = {"ensure_ascii": False, "separators": (",", ":")}
    with path.open("w", encoding="utf-8") as fh:
        for i in range(30):
            fh.write(json.dumps({"type": "user", "message": {"content": f"{prefix}问题{i}"}}, **compact) + "\n")
            fh.write(json.dumps({"type": "assistant", "message": {"content": [
                {"type": "text", "text": f"{prefix}回答{i}"}
            ]}}, **compact) + "\n")


def _event(session: str, transcript: Path) -> str:
    return json.dumps({
        "session_id": session,
        "stop_hook_active": False,
        "hook_event_name": "Stop",
        "transcript_path": str(transcript),
    }, ensure_ascii=False)


def _wait_until(predicate, timeout: float = 5.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def main() -> int:
    protocol = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    knowledge_skill = (ROOT / ".claude/skills/ai-pm-knowledge/SKILL.md").read_text(encoding="utf-8")
    assert "queue_id" in protocol and "只追加 ack" in protocol, "CLAUDE.md 未接入 queue_id/ack 协议"
    assert "queue_id" in knowledge_skill and "只追加 ack" in knowledge_skill, \
        "ai-pm-knowledge 显式 sync/add 仍在使用旧删队列协议"
    assert "处理完把已消费行清出队列" not in knowledge_skill
    with tempfile.TemporaryDirectory(prefix="aipm-kc-hook-selftest-") as raw:
        root = Path(raw)
        home = root / "home"
        bindir = root / "bin"
        (root / ".claude/hooks").mkdir(parents=True)
        (root / "scripts").mkdir()
        home.mkdir()
        bindir.mkdir()
        (root / ".claude/hooks/.knowledge-capture.enabled").touch()

        # 故意拉长 digest 前置窗口：旧 pgrep 锁在此期间必然看不到 claude 进程。
        digest_wrapper = root / "scripts/kc-digest.py"
        digest_wrapper.write_text(
            "#!/usr/bin/env python3\n"
            "import os,sys,time\n"
            "time.sleep(0.35)\n"
            f"os.execv(sys.executable,[sys.executable,{str(DIGEST)!r},*sys.argv[1:]])\n",
            encoding="utf-8",
        )
        digest_wrapper.chmod(0o755)

        claude_stub = bindir / "claude"
        claude_stub.write_text(
            "#!/usr/bin/env python3\n"
            "import json,os,sys,time\n"
            "home=os.environ['HOME']\n"
            "with open(os.path.join(home,'consumer-spawns.jsonl'),'a',encoding='utf-8') as f:\n"
            " f.write(json.dumps({'argv':sys.argv[1:]},ensure_ascii=False)+'\\n')\n"
            "time.sleep(0.45)\n",
            encoding="utf-8",
        )
        claude_stub.chmod(0o755)

        t1, t2 = root / "t1.jsonl", root / "t2.jsonl"
        _transcript(t1, "甲")
        _transcript(t2, "乙")
        env = os.environ.copy()
        env["HOME"] = str(home)
        env["PATH"] = str(bindir) + os.pathsep + env["PATH"]

        processes = [
            subprocess.Popen(["bash", str(HOOK)], cwd=root, env=env, text=True,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE),
            subprocess.Popen(["bash", str(HOOK)], cwd=root, env=env, text=True,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE),
        ]
        outputs = [processes[0].communicate(_event("session-a", t1), timeout=5),
                   processes[1].communicate(_event("session-b", t2), timeout=5)]
        assert all(proc.returncode == 0 for proc in processes), outputs
        assert all(stdout.strip() == "{}" for stdout, _ in outputs), outputs

        spawn_log = home / "consumer-spawns.jsonl"
        assert _wait_until(lambda: spawn_log.exists(), timeout=5), "消费者未启动"
        # 等可能的第二个旧消费者也把 spawn 留下，避免过早断言假绿。
        time.sleep(0.9)
        spawns = [json.loads(line) for line in spawn_log.read_text(encoding="utf-8").splitlines()]
        assert len(spawns) == 1, f"单飞失效：实际启动 {len(spawns)} 个消费者"

        queue = home / ".ai-pm/knowledge/pending.jsonl"
        rows = [json.loads(line) for line in queue.read_text(encoding="utf-8").splitlines()]
        assert len(rows) == 2 and all(row.get("queue_id") for row in rows), rows
        prompt = spawns[0]["argv"][spawns[0]["argv"].index("-p") + 1]
        assert "queue_id" in prompt and "只追加 ack" in prompt, prompt
        assert "Edit 把该行从 pending" not in prompt and "Write 整文件" not in prompt, prompt
        assert "part-*-of-*.md" in prompt, prompt

        lockdir = home / ".ai-pm/knowledge/consumer.lock"
        assert _wait_until(lambda: not lockdir.exists(), timeout=5), "消费者退出后未释放 lockdir"

        # enqueue 助手异常时不得绕开共享锁直接 append，也不得推进水位；
        # 这样下次 Stop 在助手恢复后仍能重试同一区间。
        digest_wrapper.write_text("#!/usr/bin/env python3\nraise SystemExit(2)\n", encoding="utf-8")
        digest_wrapper.chmod(0o755)
        t3 = root / "t3.jsonl"
        _transcript(t3, "丙")
        failed = subprocess.run(
            ["bash", str(HOOK)], cwd=root, env=env, text=True,
            input=_event("session-c", t3), capture_output=True, timeout=5,
        )
        assert failed.returncode == 0 and failed.stdout.strip() == "{}", failed
        rows_after_failure = [json.loads(line) for line in queue.read_text(encoding="utf-8").splitlines()]
        assert len(rows_after_failure) == 2, "enqueue 失败时不得无锁追加旧格式行"
        assert not (home / ".ai-pm/hook_state/session-c.last_count").exists(), \
            "enqueue 失败时水位不得前移"

    print("kc-hook selftest: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
