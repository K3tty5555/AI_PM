#!/usr/bin/env python3
"""ai-pm-setup CLI：输出事实和错误码，流程文案由 SKILL.md 负责。"""
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

sys.path.insert(0, str(Path(__file__).resolve().parent))
import setup_android  # noqa: E402
import setup_browser  # noqa: E402
import setup_env  # noqa: E402
import setup_mcp  # noqa: E402
import setup_state  # noqa: E402
from setup_common import (CONFIG_PATH, EXIT_ENV, EXIT_FAIL, EXIT_OK, INSTALL_ROOT, LOCK_PATH, MCP_PATH,
                          STATE_PATH, TARGETS, force_utf8, load_config, result, run, run_bytes, tools_home)  # noqa: E402

OS = setup_env.os_name()
ARCH = setup_env.arch_name(platform.machine())
SERVER_OF = {"web": "playwright", "android": "mobile-mcp", "windows-app": "windows-mcp"}
ENV_CODES = {"MCP_CONFIG_INVALID", "CONFIG_INVALID", "LOCK_BUSY", "NODE_MISSING", "NODE_TOO_OLD",
             "PYTHON_MISSING", "PYTHON_TOO_OLD", "NOT_APPLICABLE", "INVALID_KEY"}


def applicable(target: str) -> bool:
    return OS in ("mac", "windows") and (target != "windows-app" or OS == "windows")


def parse_mcp_list(text: str) -> Dict[str, str]:
    out = {}
    for line in text.splitlines():
        line = re.sub(r"\x1b\[[0-9;]*m", "", line).strip()
        match = re.match(r"^([A-Za-z0-9_.-]+):\s*(.*)$", line)
        if not match:
            continue
        status = match.group(2).lower()
        if "connected" in status and "fail" not in status:
            out[match.group(1)] = "connected"
        elif "approv" in status or "pending" in status:
            out[match.group(1)] = "needs-approval"
        elif "fail" in status or "error" in status:
            out[match.group(1)] = "failed"
        else:
            out[match.group(1)] = "unknown"
    return out


def probe_adb() -> Any:
    return setup_android.find_adb(OS, dict(os.environ), str(Path.home()), str(tools_home()), shutil.which, run, os.path.exists)


def _ours(state: Dict[str, Any], target: str, conf: Dict[str, Any]) -> Set[str]:
    ours: Set[str] = set()
    written = state.get("targets", {}).get(target, {}).get("mcp_written")
    if written:
        ours.add(written)
    if target == "web":
        for browser in ("chrome", "msedge"):
            entry = setup_mcp.render_entry(conf["servers"]["playwright"], setup_mcp.base_ctx(
                conf, "playwright", browser=browser, tools=str(tools_home()).replace("\\", "/")))
            ours.add(setup_mcp.entry_digest(entry))
    return ours


def _render(target: str, conf: Dict[str, Any], **ctx: Any) -> Dict[str, Any]:
    name = SERVER_OF[target]
    defaults = {"tools": str(tools_home()).replace("\\", "/"), "android_home": None}
    defaults.update(ctx)
    return setup_mcp.render_entry(conf["servers"][name], setup_mcp.base_ctx(conf, name, **defaults))


def _write_entry(target: str, entry: Dict[str, Any], conf: Dict[str, Any]) -> str:
    with setup_state.file_lock(LOCK_PATH):
        state = setup_state.load_state(STATE_PATH)
        status = setup_mcp.apply_entry(MCP_PATH, SERVER_OF[target], entry, _ours(state, target, conf))
        if status in ("added", "updated", "unchanged"):
            setup_state.set_value_unlocked(STATE_PATH, target, "mcp_written", setup_mcp.entry_digest(entry))
            setup_state.set_value_unlocked(STATE_PATH, target, "pending_recheck", status != "unchanged")
    return status


def quick_status(target: str, conf: Dict[str, Any]) -> Dict[str, Any]:
    if not applicable(target):
        return result(target, False, "NOT_APPLICABLE", os=OS)
    try:
        missing = setup_mcp.missing_servers(MCP_PATH, [SERVER_OF[target]])
    except setup_mcp.McpConfigError as exc:
        return result(target, False, "MCP_CONFIG_INVALID", detail=str(exc))
    state = setup_state.load_state(STATE_PATH).get("targets", {}).get(target, {})
    facts = {"pending_recheck": bool(state.get("pending_recheck"))}
    if target == "web":
        info = setup_env.detect(OS, ARCH, dict(os.environ), run, shutil.which, os.path.exists)
        facts["env"] = info
        browser = setup_browser.find_browser(OS, dict(os.environ), shutil.which, os.path.exists)
        facts["browser"] = browser
        if "NODE_MISSING" in info["problems"] or "NODE_TOO_OLD" in info["problems"]:
            return result(target, False, next(c for c in ("NODE_MISSING", "NODE_TOO_OLD") if c in info["problems"]), **facts)
        if not browser:
            return result(target, False, "BROWSER_MISSING", **facts)
    if target == "android":
        found, blocked = probe_adb()
        facts.update(adb=found, blocked=blocked)
        if not found:
            return result(target, False, "ADB_BLOCKED" if blocked else "ADB_MISSING", **facts)
        mobile = _render(target, conf, android_home=found.get("sdk"))
        if not Path(mobile["args"][0]).exists():
            return result(target, False, "TOOL_MISSING", **facts)
    if target == "windows-app":
        entry = setup_mcp.read_mcp(MCP_PATH)["mcpServers"].get("windows-mcp", {})
        if not entry.get("command") or not os.path.exists(entry["command"]):
            return result(target, False, "TOOL_MISSING", **facts)
    if missing:
        return result(target, False, "MCP_MISSING", **facts)
    if facts["pending_recheck"]:
        return result(target, False, "PENDING_RECHECK", **facts)
    return result(target, True, "OK", **facts)


def _mcp_health(name: str) -> str:
    if not shutil.which("claude"):
        return "missing-cli"
    rc, out = run(["claude", "mcp", "list"], 30, cwd=str(INSTALL_ROOT))
    if rc != 0:
        return "failed"
    return parse_mcp_list(out).get(name, "absent")


def full_check(target: str, conf: Dict[str, Any]) -> Dict[str, Any]:
    base = quick_status(target, conf)
    if base["code"] not in ("OK", "PENDING_RECHECK"):
        return base
    facts = dict(base["facts"])
    if target == "android":
        adb = facts["adb"]["path"]
        _, out = run([adb, "devices", "-l"], 10)
        devices = setup_android.parse_devices(out)
        code = setup_android.classify(devices)
        state = setup_state.load_state(STATE_PATH).get("targets", {}).get("android", {})
        serial = setup_android.pick_serial(devices, state.get("device_serial"))
        facts["devices"] = devices
        if code != "OK" or not serial:
            return result(target, False, code, **facts)
        dev = setup_android.device_check(adb, serial, run, run_bytes)
        facts.update(serial=serial, device=dev, port_5037=setup_android.port_5037_owner(OS, run))
        if not dev["ui_ok"]:
            return result(target, False, "UI_DUMP_FAILED", **facts)
        if not dev["screenshot_ok"]:
            return result(target, False, "SCREENSHOT_FAILED", **facts)
    health = _mcp_health(SERVER_OF[target])
    facts["mcp"] = health
    if health in ("missing-cli", "failed", "absent", "unknown"):
        return result(target, False, "MCP_NOT_CONNECTED", **facts)
    if health == "needs-approval":
        return result(target, False, "MCP_NEEDS_APPROVAL", **facts)
    with setup_state.file_lock(LOCK_PATH):
        setup_state.set_value_unlocked(STATE_PATH, target, "pending_recheck", False)
        if target == "android":
            setup_state.set_value_unlocked(STATE_PATH, target, "device_serial", facts["serial"])
    return result(target, True, "OK", **facts)


def install(target: str, conf: Dict[str, Any], source: str, browser_kind: Optional[str], yes: bool) -> Dict[str, Any]:
    if not applicable(target):
        return result(target, False, "NOT_APPLICABLE", os=OS)
    state = setup_state.load_state(STATE_PATH).get("targets", {}).get(target, {})
    if not yes and state.get("consent") is not True:
        return result(target, False, "CONSENT_REQUIRED", license_url=conf.get("android_platform_tools", {}).get("license_url"))
    env_info = setup_env.detect(OS, ARCH, dict(os.environ), run, shutil.which, os.path.exists)
    if target in ("web", "android"):
        for code in ("NODE_MISSING", "NODE_TOO_OLD", "ARM64_UNSUPPORTED"):
            if code in env_info["problems"]:
                return result(target, False, code, env=env_info)
    if target == "web":
        browser = setup_browser.find_browser(OS, dict(os.environ), shutil.which, os.path.exists)
        if browser_kind:
            if not browser or browser["kind"] != browser_kind:
                browser = next((b for b in (setup_browser.browser_candidates(OS, dict(os.environ), shutil.which))
                                if b[0] == browser_kind and os.path.exists(b[1])), None)
            if not browser:
                return result(target, False, "BROWSER_MISSING")
        if not browser:
            return result(target, False, "BROWSER_MISSING")
        pw = conf["servers"]["playwright"]
        prefix = tools_home() / "npm"
        prefix.mkdir(parents=True, exist_ok=True)
        npm = shutil.which("npm")
        if not npm:
            return result(target, False, "NPM_INSTALL_FAILED", detail="npm 不在 PATH")
        rc, out = run([npm, "install", "--prefix", str(prefix), "%s@%s" % (pw["npm_package"], pw["version"]),
                       "--no-audit", "--no-fund", "--registry=%s" % conf["mirrors"]["npm_registry"]], 600)
        if rc != 0:
            return result(target, False, "NPM_INSTALL_FAILED", output=out[-800:])
        entry = _render(target, conf, browser=browser["kind"])
        status = _write_entry(target, entry, conf)
        return result(target, status != "conflict", "MCP_CONFLICT" if status == "conflict" else "OK", mcp=status, browser=browser)
    if target == "android":
        found, blocked = probe_adb()
        if not found:
            pin = conf["android_platform_tools"]
            asset = pin["assets"]["windows" if OS == "windows" else "darwin"]
            vendor = INSTALL_ROOT / "vendor" / "android-platform-tools" / asset["file"] if source == "vendor" else None
            res = setup_android.install_platform_tools(pin, OS, tools_home(), setup_android.fetch, vendor_zip=vendor)
            if not res["ok"]:
                return result(target, False, res["code"], tried=res["tried"], blocked=blocked,
                              package_manager=pin["package_managers"].get(OS), license_url=pin["license_url"])
            found, blocked = probe_adb()
            if not found:
                return result(target, False, "ADB_BLOCKED", blocked=blocked)
        mm = conf["servers"]["mobile-mcp"]
        prefix = tools_home() / "npm"
        prefix.mkdir(parents=True, exist_ok=True)
        npm = shutil.which("npm")
        if not npm:
            return result(target, False, "NPM_INSTALL_FAILED", detail="npm 不在 PATH")
        rc, out = run([npm, "install", "--prefix", str(prefix), "%s@%s" % (mm["npm_package"], mm["version"]),
                       "--no-audit", "--no-fund", "--registry=%s" % conf["mirrors"]["npm_registry"]], 600)
        if rc != 0:
            return result(target, False, "NPM_INSTALL_FAILED", output=out[-800:])
        status = _write_entry(target, _render(target, conf, android_home=found.get("sdk")), conf)
        setup_state.set_value(STATE_PATH, LOCK_PATH, target, "adb_path", found["path"])
        return result(target, status != "conflict", "MCP_CONFLICT" if status == "conflict" else "OK", mcp=status, adb=found)
    if "PYTHON_MISSING" in env_info["problems"]:
        return result(target, False, "PYTHON_MISSING", env=env_info)
    if "PYTHON_TOO_OLD" in env_info["problems"]:
        return result(target, False, "PYTHON_TOO_OLD", env=env_info)
    uv = shutil.which("uv")
    py = env_info["python"]["cmd"]
    if not uv:
        rc, out = run(py + ["-m", "pip", "install", "--user", "uv", "-i", conf["mirrors"]["pypi_index"]], 600)
        uv = shutil.which("uv")
        if rc != 0 or not uv:
            return result(target, False, "UV_INSTALL_FAILED", output=out[-800:])
    wm = conf["servers"]["windows-mcp"]
    uv_env = dict(os.environ, UV_PYTHON_INSTALL_MIRROR=conf["mirrors"]["uv_python_mirror"], UV_DEFAULT_INDEX=conf["mirrors"]["pypi_index"])
    rc, out = run([uv, "tool", "install", "%s==%s" % (wm["pypi_package"], wm["version"]), "--python", "3.14"], 900, env=uv_env)
    if rc != 0 and "already installed" not in out:
        return result(target, False, "UV_INSTALL_FAILED", output=out[-800:])
    rc, bindir = run([uv, "tool", "dir", "--bin"], 30, env=uv_env)
    exe = Path(bindir.strip()) / "windows-mcp.exe"
    if not exe.exists():
        return result(target, False, "TOOL_MISSING", expected=str(exe))
    status = _write_entry(target, _render(target, conf, windows_mcp=str(exe).replace("\\", "/")), conf)
    return result(target, status != "conflict", "MCP_CONFLICT" if status == "conflict" else "OK", mcp=status)


def _emit(results: List[Dict[str, Any]], as_json: bool) -> int:
    if as_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for item in results:
            print("%s %s: %s" % ("✅" if item["ok"] else "❌", item["target"], item["code"]))
    return EXIT_OK if all(item["ok"] for item in results) else (EXIT_ENV if any(item["code"] in ENV_CODES for item in results) else EXIT_FAIL)


def main(argv: Optional[List[str]] = None) -> int:
    force_utf8()
    ap = argparse.ArgumentParser(prog="aipm_setup")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("status", "install", "check", "register", "disable"):
        parser = sub.add_parser(name)
        parser.add_argument("--target", choices=TARGETS, required=name != "status")
        parser.add_argument("--json", action="store_true")
        if name == "status":
            parser.add_argument("--quick", action="store_true")
        if name == "install":
            parser.add_argument("--source", choices=("download", "vendor"), default="download")
            parser.add_argument("--browser", choices=("chrome", "msedge"))
            parser.add_argument("--yes", action="store_true")
        if name == "register":
            parser.add_argument("--key", required=True)
            parser.add_argument("--value", required=True)
    parser = sub.add_parser("launch-browser")
    parser.add_argument("--port", type=int, default=9223)
    parser.add_argument("--url", default="about:blank")
    parser.add_argument("--json", action="store_true")
    parser = sub.add_parser("pending-hint")
    parser.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    if args.cmd == "pending-hint":
        pending = [t for t, value in setup_state.load_state(STATE_PATH).get("targets", {}).items() if value.get("pending_recheck")]
        if pending and not args.json:
            print("🔧 操作能力还差一步：%s 布置后待重开自检，说「继续布置」或跑 /ai-pm setup" % "、".join(pending))
        elif pending:
            print(json.dumps({"pending": pending}, ensure_ascii=False))
        return EXIT_OK
    try:
        conf = load_config(CONFIG_PATH)
        if args.cmd == "status":
            selected = [args.target] if args.target else [t for t in TARGETS if applicable(t)]
            return _emit([quick_status(t, conf) if args.quick else full_check(t, conf) for t in selected], args.json)
        if args.cmd == "check":
            return _emit([full_check(args.target, conf)], args.json)
        if args.cmd == "install":
            return _emit([install(args.target, conf, args.source, args.browser, args.yes)], args.json)
        if args.cmd == "register":
            if not applicable(args.target):
                return _emit([result(args.target, False, "NOT_APPLICABLE")], args.json)
            try:
                value = json.loads(args.value)
                setup_state.set_value(STATE_PATH, LOCK_PATH, args.target, args.key, value)
            except json.JSONDecodeError:
                setup_state.set_value(STATE_PATH, LOCK_PATH, args.target, args.key, args.value)
            except ValueError as exc:
                return _emit([result(args.target, False, "INVALID_KEY", detail=str(exc))], args.json)
            return _emit([result(args.target, True, "OK", key=args.key)], args.json)
        if args.cmd == "disable":
            if not applicable(args.target):
                return _emit([result(args.target, False, "NOT_APPLICABLE")], args.json)
            state = setup_state.load_state(STATE_PATH)
            status = setup_mcp.remove_entry(MCP_PATH, SERVER_OF[args.target], _ours(state, args.target, conf))
            return _emit([result(args.target, status != "conflict", "MCP_CONFLICT" if status == "conflict" else "OK", removed=status)], args.json)
        if args.cmd == "launch-browser":
            if not setup_browser.port_free(args.port):
                return _emit([result("web", False, "PORT_BUSY", port=args.port)], args.json)
            browser = setup_browser.find_browser(OS, dict(os.environ), shutil.which, os.path.exists)
            if not browser:
                return _emit([result("web", False, "BROWSER_MISSING")], args.json)
            profile = setup_browser.launch(browser, args.port, args.url, OS)
            return _emit([result("web", True, "OK", port=args.port, browser=browser, profile=str(profile))], args.json)
    except setup_state.LockBusy as exc:
        return _emit([result(getattr(args, "target", "-"), False, "LOCK_BUSY", detail=str(exc))], getattr(args, "json", False))
    except (setup_mcp.McpConfigError, ValueError, OSError) as exc:
        return _emit([result(getattr(args, "target", "-"), False, "CONFIG_INVALID", detail=str(exc))], getattr(args, "json", False))
    return EXIT_ENV


if __name__ == "__main__":
    sys.exit(main())
