"""本机登记与跨系统文件锁。"""
from __future__ import annotations

import json
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator

import setup_common  # noqa: F401
from aipm_core import atomic_write_json

ALLOWED_KEYS = {"consent", "solution", "adb_path", "device_serial", "pending_recheck", "mcp_written"}


class LockBusy(RuntimeError):
    pass


@contextmanager
def file_lock(lock: Path, timeout: float = 10.0, stale_after: float = 600.0) -> Iterator[None]:
    lock.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + timeout
    while True:
        try:
            fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            try:
                os.write(fd, str(os.getpid()).encode("ascii"))
            finally:
                os.close(fd)
            break
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > stale_after:
                    lock.unlink()
                    continue
            except FileNotFoundError:
                continue
            if time.monotonic() > deadline:
                raise LockBusy("另一个会话正在布置，请稍后重试")
            time.sleep(0.05)
    try:
        yield
    finally:
        try:
            lock.unlink()
        except FileNotFoundError:
            pass


def empty_state() -> Dict[str, Any]:
    return {"schema_version": 1, "targets": {}}


def load_state(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return empty_state()
    if not isinstance(data, dict) or not isinstance(data.get("targets"), dict):
        return empty_state()
    targets = {str(k): v for k, v in data["targets"].items() if isinstance(v, dict)}
    return {"schema_version": 1, "targets": targets}


def set_value_unlocked(path: Path, target: str, key: str, value: Any) -> Dict[str, Any]:
    if key not in ALLOWED_KEYS:
        raise ValueError("登记字段不允许：%s" % key)
    data = load_state(path)
    data["targets"].setdefault(target, {})[key] = value
    atomic_write_json(path, data)
    return data


def set_value(path: Path, lock: Path, target: str, key: str, value: Any) -> Dict[str, Any]:
    with file_lock(lock):
        return set_value_unlocked(path, target, key, value)
