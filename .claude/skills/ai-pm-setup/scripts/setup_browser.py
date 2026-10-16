"""跨平台启动独立、可接管的浏览器。"""
from __future__ import annotations

import ntpath
import socket
import subprocess
import tempfile
from pathlib import Path
from typing import Callable, Dict, Optional, List, Tuple

MAC_APPS = [("chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            ("chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"),
            ("msedge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge")]


def browser_candidates(os_n: str, env: Dict[str, str], which: Callable) -> List[Tuple[str, str]]:
    if os_n == "mac":
        return list(MAC_APPS)
    if os_n == "windows":
        bases = [env.get(k) for k in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA") if env.get(k)]
        return [(kind, ntpath.join(base, *parts)) for kind, parts in
                [("chrome", ("Google", "Chrome", "Application", "chrome.exe")),
                 ("msedge", ("Microsoft", "Edge", "Application", "msedge.exe"))]
                for base in bases]
    return [("chrome", p) for p in (which("google-chrome"), which("chromium"), which("chromium-browser")) if p]


def find_browser(os_n: str, env: Dict[str, str], which: Callable, exists: Callable) -> Optional[Dict[str, str]]:
    for kind, path in browser_candidates(os_n, env, which):
        if exists(path):
            return {"kind": kind, "path": path}
    return None


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def launch(browser: Dict[str, str], port: int, url: str, os_n: str, popen: Callable = subprocess.Popen) -> Path:
    profile = Path(tempfile.mkdtemp(prefix="aipm-browser-"))
    profile.chmod(0o700)
    args = [browser["path"], "--remote-debugging-port=%d" % port, "--user-data-dir=%s" % profile,
            "--no-first-run", "--no-default-browser-check", url]
    kw = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL, "stdin": subprocess.DEVNULL}
    kw["creationflags" if os_n == "windows" else "start_new_session"] = 0x00000008 | 0x00000200 if os_n == "windows" else True
    popen(args, **kw)
    return profile
