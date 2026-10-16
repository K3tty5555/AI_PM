"""基础环境探测，保持 Python 3.9 语法。"""
from __future__ import annotations

import ntpath
import re
import sys
from typing import Any, Callable, Dict, Optional, Tuple

PY_PROBE = ["-c", "import sys;print(sys.version.split()[0])"]
NODE_MIN = 20
PY_MIN_WINDOWS_MCP = 3.14


def os_name(platform: str = sys.platform) -> str:
    if platform.startswith("win"):
        return "windows"
    if platform == "darwin":
        return "mac"
    return "linux"


def arch_name(machine: str) -> str:
    m = machine.lower()
    return "arm64" if m in ("arm64", "aarch64") else "x64" if m in ("x86_64", "amd64") else m


def parse_version(text: str) -> Optional[Tuple[int, int, int]]:
    m = re.match(r"\s*v?(\d+)\.(\d+)(?:\.(\d+))?", text or "")
    return tuple(int(x or 0) for x in m.groups()) if m else None


def parse_node_version(text: str) -> Optional[Tuple[int, int, int]]:
    return parse_version(text)


def find_python(os_n: str, run: Callable, which: Callable) -> Optional[Dict[str, Any]]:
    candidates = [["python3"], ["python"], ["py", "-3"]] if os_n == "windows" else [["python3"], ["python"]]
    for cand in candidates:
        if not which(cand[0]):
            continue
        rc, out = run(cand + PY_PROBE, 10)
        line = out.strip().splitlines()[0] if out.strip() else ""
        if rc == 0 and parse_version(line):
            return {"cmd": cand, "version": line}
    return None


def find_git_bash(os_n: str, env: Dict[str, str], which: Callable, exists: Callable) -> Optional[str]:
    if os_n != "windows":
        return which("bash")
    bases = [env.get(k) for k in ("ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "LOCALAPPDATA") if env.get(k)]
    for base in bases:
        for sub in (("Git", "bin", "bash.exe"), ("Programs", "Git", "bin", "bash.exe")):
            path = ntpath.join(base, *sub)
            if exists(path):
                return path
    found = which("bash")
    return found if found and "system32" not in found.lower() else None


def detect(os_n: str, arch: str, env: Dict[str, str], run: Callable, which: Callable, exists: Callable) -> Dict[str, Any]:
    problems = []
    python = find_python(os_n, run, which)
    if not python:
        problems.append("PYTHON_MISSING")
    node_ver = parse_node_version(run(["node", "--version"], 10)[1]) if which("node") else None
    if node_ver is None:
        problems.append("NODE_MISSING")
    elif node_ver[0] < NODE_MIN:
        problems.append("NODE_TOO_OLD")
    npx = which("npx")
    if not npx:
        problems.append("NPX_MISSING")
    git_bash = find_git_bash(os_n, env, which, exists)
    if os_n == "windows" and not git_bash:
        problems.append("GIT_BASH_MISSING")
    if os_n == "windows" and arch == "arm64":
        problems.append("ARM64_UNSUPPORTED")
    if os_n == "windows" and python and parse_version(python["version"])[0:2] < (3, 14):
        problems.append("PYTHON_TOO_OLD")
    return {"os": os_n, "arch": arch, "python": python,
            "node": {"version": ".".join(map(str, node_ver)) if node_ver else None,
                     "ok": bool(node_ver and node_ver[0] >= NODE_MIN)},
            "npx": npx, "claude": which("claude"), "git_bash": git_bash, "problems": problems}
