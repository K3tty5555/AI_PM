"""ai-pm-setup 公共件：路径、子进程、结果格式。仅依赖标准库。"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

INSTALL_ROOT = Path(__file__).resolve().parents[4]
CONFIG_PATH = INSTALL_ROOT / "templates" / "configs" / "mcp-servers.json"
STATE_PATH = INSTALL_ROOT / "templates" / "configs" / "device-setup.local.json"
LOCK_PATH = INSTALL_ROOT / "templates" / "configs" / "device-setup.local.lock"
MCP_PATH = INSTALL_ROOT / ".mcp.json"
TARGETS = ("web", "android", "windows-app")
EXIT_OK, EXIT_FAIL, EXIT_ENV = 0, 1, 2

sys.path.insert(0, str(INSTALL_ROOT / "scripts"))


def tools_home() -> Path:
    return Path(os.environ.get("AIPM_TOOLS_HOME") or Path.home() / ".ai-pm" / "tools")


def force_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass


def load_config(path: Path = CONFIG_PATH) -> Dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise ValueError("mcp-servers.json schema_version 不支持")
    return data


def run(cmd: List[str], timeout: float, cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None) -> Tuple[int, str]:
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout, cwd=cwd, env=env)
    except FileNotFoundError:
        return 127, ""
    except subprocess.TimeoutExpired:
        return 124, ""
    except OSError as exc:
        return 126, str(exc)
    return proc.returncode, (proc.stdout + proc.stderr).decode("utf-8", "replace")


def run_bytes(cmd: List[str], timeout: float, env: Optional[Dict[str, str]] = None) -> Tuple[int, bytes]:
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout, env=env)
    except FileNotFoundError:
        return 127, b""
    except subprocess.TimeoutExpired:
        return 124, b""
    except OSError:
        return 126, b""
    return proc.returncode, proc.stdout


def result(target: str, ok: bool, code: str, **facts: Any) -> Dict[str, Any]:
    return {"target": target, "ok": ok, "code": code, "facts": facts}
