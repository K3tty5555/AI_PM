"""安全合并项目级 .mcp.json，只修改 ai-pm-setup 自己负责的条目。"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any, Dict, List, Set

import setup_common  # noqa: F401
from aipm_core import atomic_write_json


class McpConfigError(ValueError):
    pass


def read_mcp(path: Path) -> Dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        return {"mcpServers": {}}
    if not text.strip():
        return {"mcpServers": {}}
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise McpConfigError(".mcp.json 不是合法 JSON") from exc
    if not isinstance(data, dict) or not isinstance(data.get("mcpServers", {}), dict):
        raise McpConfigError(".mcp.json 顶层必须有 mcpServers 对象")
    data.setdefault("mcpServers", {})
    return data


def base_ctx(conf: Dict[str, Any], server_name: str, **extra: Any) -> Dict[str, Any]:
    return dict(dict(conf["mirrors"], version=conf["servers"][server_name]["version"]), **extra)


def render_entry(server: Dict[str, Any], ctx: Dict[str, Any]) -> Dict[str, Any]:
    present = {k: v for k, v in ctx.items() if v is not None}

    def fmt(value: str) -> Any:
        try:
            return value.format(**present)
        except KeyError:
            return None

    command = fmt(server["command"])
    args = [fmt(a) for a in server.get("args", [])]
    if command is None or any(a is None for a in args):
        raise KeyError("启动配置缺少占位参数")
    entry: Dict[str, Any] = {"command": command, "args": args}
    env = {k: fmt(v) for k, v in server.get("env", {}).items()}
    env = {k: v for k, v in env.items() if v is not None}
    if env:
        entry["env"] = env
    return entry


def entry_digest(entry: Dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(entry, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:16]


def plan_merge(data: Dict[str, Any], name: str, entry: Dict[str, Any], ours: Set[str]) -> str:
    current = data["mcpServers"].get(name)
    if current is None:
        return "added"
    if current == entry:
        return "unchanged"
    return "updated" if entry_digest(current) in ours else "conflict"


def _safe_path(path: Path) -> None:
    if path.exists() and (path.is_symlink() or path.is_dir()):
        raise McpConfigError("拒绝覆盖符号链接或目录：%s" % path)


def write_mcp(path: Path, data: Dict[str, Any]) -> None:
    _safe_path(path)
    backup = path.with_name(path.name + ".bak")
    _safe_path(backup)
    if path.exists():
        shutil.copy2(path, backup)
    atomic_write_json(path, data)


def apply_entry(path: Path, name: str, entry: Dict[str, Any], ours: Set[str]) -> str:
    data = read_mcp(path)
    status = plan_merge(data, name, entry, ours)
    if status in ("added", "updated"):
        data["mcpServers"][name] = entry
        write_mcp(path, data)
    return status


def remove_entry(path: Path, name: str, ours: Set[str]) -> str:
    data = read_mcp(path)
    current = data["mcpServers"].get(name)
    if current is None:
        return "absent"
    if entry_digest(current) not in ours:
        return "conflict"
    del data["mcpServers"][name]
    write_mcp(path, data)
    return "removed"


def missing_servers(path: Path, names: List[str]) -> List[str]:
    present = read_mcp(path)["mcpServers"]
    return [n for n in names if n not in present]
