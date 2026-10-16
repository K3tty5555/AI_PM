"""安卓 adb 布置、自检与安全下载。"""
from __future__ import annotations

import hashlib
import ntpath
import posixpath
import shutil
import socket
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _pm(os_n: str):
    return ntpath if os_n == "windows" else posixpath


def adb_candidates(os_n: str, env: Dict[str, str], home: str, tools: str) -> List[Tuple[str, str, str]]:
    pm, exe = _pm(os_n), "adb.exe" if os_n == "windows" else "adb"
    sdks = [(key, env[key]) for key in ("ANDROID_HOME", "ANDROID_SDK_ROOT") if env.get(key)]
    if os_n == "windows" and env.get("LOCALAPPDATA"):
        sdks.append(("android-studio", pm.join(env["LOCALAPPDATA"], "Android", "Sdk")))
    if os_n == "mac":
        sdks.append(("android-studio", pm.join(home, "Library", "Android", "sdk")))
    sdks.append(("aipm-shared", pm.join(str(tools), "android-sdk")))
    return [(src, sdk, pm.join(sdk, "platform-tools", exe)) for src, sdk in sdks]


def _probe(path: str, run: Callable) -> Tuple[bool, str]:
    rc, out = run([path, "version"], 3)
    return rc == 0 and "Android Debug Bridge" in out, (out.strip().splitlines() or [""])[0]


def find_adb(os_n: str, env: Dict[str, str], home: str, tools: str, which: Callable,
             run: Callable, exists: Callable) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    blocked = []
    for src, sdk, path in adb_candidates(os_n, env, home, tools):
        if exists(path):
            ok, version = _probe(path, run)
            if ok:
                return {"path": path, "sdk": sdk, "source": src, "version": version}, blocked
            blocked.append(path)
    on_path = which("adb")
    if on_path:
        ok, version = _probe(on_path, run)
        if ok:
            pm = _pm(os_n)
            parent = pm.dirname(on_path)
            sdk = pm.dirname(parent) if pm.basename(parent) == "platform-tools" else None
            return {"path": on_path, "sdk": sdk, "source": "path", "version": version}, blocked
        blocked.append(on_path)
    return None, blocked


def parse_devices(text: str) -> List[Dict[str, Any]]:
    devices = []
    for raw in text.replace("\r\n", "\n").splitlines():
        line = raw.strip()
        if not line or line.startswith("List of devices") or line.startswith("*"):
            continue
        parts = line.split()
        serial, rest = parts[0], parts[1:]
        if rest[:2] == ["no", "permissions"]:
            state, attrs = "no permissions", rest[2:]
        else:
            state, attrs = (rest[0] if rest else "unknown"), rest[1:]
        info = {k: v for k, _, v in (a.partition(":") for a in attrs) if v}
        devices.append({"serial": serial, "state": state, "model": info.get("model"),
                        "device": info.get("device"), "wireless": "_adb-tls-connect" in serial or
                        (":" in serial and "." in serial)})
    return devices


def _physical(ready: List[Dict[str, Any]]) -> int:
    usb = [d for d in ready if not d["wireless"]]
    wireless = [d for d in ready if d["wireless"]]
    usb_keys = {(d.get("model"), d.get("device")) for d in usb}
    extra_wireless = [d for d in wireless if (d.get("model"), d.get("device")) not in usb_keys]
    return len({d["serial"] for d in usb}) + len({d["serial"] for d in extra_wireless})


def classify(devices: List[Dict[str, Any]]) -> str:
    if not devices:
        return "NO_DEVICE"
    ready = [d for d in devices if d["state"] == "device"]
    if not ready:
        states = {d["state"] for d in devices}
        for state, code in (("unauthorized", "UNAUTHORIZED"), ("no permissions", "NO_PERMISSION"), ("offline", "OFFLINE")):
            if state in states:
                return code
        return "NO_DEVICE"
    return "MULTIPLE" if _physical(ready) > 1 else "OK"


def pick_serial(devices: List[Dict[str, Any]], preferred: Optional[str]) -> Optional[str]:
    ready = [d for d in devices if d["state"] == "device"]
    if preferred and any(d["serial"] == preferred for d in ready):
        return preferred
    if _physical(ready) != 1:
        return None
    usb = [d for d in ready if not d["wireless"]]
    return (usb or ready)[0]["serial"]


def port_5037_owner(os_n: str, run: Callable) -> Optional[Dict[str, str]]:
    if os_n == "windows":
        _, out = run(["netstat", "-ano", "-p", "TCP"], 5)
        pid = next((p[-1] for p in (line.split() for line in out.splitlines())
                    if len(p) >= 5 and p[1].endswith(":5037") and p[2] in ("0.0.0.0:0", "[::]:0")), None)
        if not pid:
            return None
        _, out = run(["tasklist", "/FI", "PID eq %s" % pid, "/FO", "CSV", "/NH"], 5)
        return {"pid": pid, "name": out.strip().split(",")[0].strip('"') if out.strip() else "?"}
    _, out = run(["lsof", "-nP", "-iTCP:5037", "-sTCP:LISTEN"], 5)
    lines = [line for line in out.splitlines()[1:] if line.strip()]
    if not lines:
        return None
    parts = lines[0].split()
    return {"pid": parts[1], "name": parts[0]}


def sha1_file(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _zip_target(dest: Path, name: str) -> Path:
    name = name.replace("\\", "/")
    if "\x00" in name or name.startswith("/") or (len(name) > 1 and name[1] == ":"):
        raise ValueError("压缩包路径不安全")
    target = (dest / name).resolve()
    try:
        target.relative_to(dest)
    except ValueError as exc:
        raise ValueError("压缩包路径越界：%s" % name) from exc
    return target


def safe_extract(zip_path: Path, dest: Path, os_n: str) -> None:
    dest = Path(dest).resolve()
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            target = _zip_target(dest, info.filename)
            mode = (info.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                raise ValueError("拒绝解压符号链接")
            if target != dest:
                target.parent.mkdir(parents=True, exist_ok=True)
        zf.extractall(dest)
    tools_dir = dest / "platform-tools"
    adb = tools_dir / ("adb.exe" if os_n == "windows" else "adb")
    if not adb.is_file():
        raise ValueError("压缩包缺少 platform-tools/adb")
    if os_n != "windows":
        for p in tools_dir.iterdir():
            if p.is_file() and "." not in p.name:
                p.chmod(0o755)


def fetch(url: str, dest: Path, timeout: float, max_bytes: int = 300 * 1024 * 1024) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "aipm-setup"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if "text/html" in resp.headers.get("Content-Type", "").lower():
            raise ValueError("HTML_INSTEAD_OF_ZIP")
        total = 0
        with open(dest, "wb") as fh:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("DOWNLOAD_TOO_LARGE")
                fh.write(chunk)


def _install_zip(zip_path: Path, sdk: Path, os_n: str) -> Optional[str]:
    staging = sdk.with_name(sdk.name + ".staging")
    backup = sdk.with_name(sdk.name + ".old")
    shutil.rmtree(staging, ignore_errors=True)
    try:
        safe_extract(zip_path, staging, os_n)
        old = sdk / "platform-tools"
        new = staging / "platform-tools"
        backup_old = backup / "platform-tools"
        shutil.rmtree(backup, ignore_errors=True)
        sdk.mkdir(parents=True, exist_ok=True)
        if old.exists():
            backup.mkdir(parents=True, exist_ok=True)
            old.rename(backup_old)
        try:
            new.rename(old)
        except Exception:
            if backup_old.exists() and not old.exists():
                backup_old.rename(old)
            raise
        shutil.rmtree(staging, ignore_errors=True)
        shutil.rmtree(backup, ignore_errors=True)
        return None
    except PermissionError:
        shutil.rmtree(staging, ignore_errors=True)
        return "IN_USE"
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        return "DOWNLOAD_FAILED"


def install_platform_tools(pin: Dict[str, Any], os_n: str, tools: Path, fetch_fn: Optional[Callable],
                           vendor_zip: Optional[Path] = None) -> Dict[str, Any]:
    if os_n not in ("mac", "windows"):
        return {"ok": False, "code": "NOT_APPLICABLE", "source": None, "sdk": str(Path(tools) / "android-sdk"), "tried": []}
    asset = pin["assets"]["windows" if os_n == "windows" else "darwin"]
    sdk = Path(tools) / "android-sdk"
    tried = []

    def done(zp: Path, source: str) -> Dict[str, Any]:
        err = _install_zip(zp, sdk, os_n)
        return {"ok": not err, "code": err or "OK", "source": source, "sdk": str(sdk), "tried": tried}

    if vendor_zip is not None:
        if not Path(vendor_zip).is_file():
            return {"ok": False, "code": "VENDOR_MISSING", "source": "vendor", "sdk": str(sdk), "tried": tried}
        if sha1_file(Path(vendor_zip)) != asset["sha1"]:
            return {"ok": False, "code": "SHA1_MISMATCH", "source": "vendor", "sdk": str(sdk), "tried": tried}
        return done(Path(vendor_zip), "vendor")
    with tempfile.TemporaryDirectory() as tmp:
        zp = Path(tmp) / asset["file"]
        for base in pin["channels"]:
            url = base.rstrip("/") + "/" + asset["file"]
            try:
                fetch_fn(url, zp, 180)
                if sha1_file(zp) != asset["sha1"]:
                    raise ValueError("SHA1_MISMATCH")
                return done(zp, url)
            except Exception as exc:
                tried.append({"url": url, "error": str(exc)})
                if zp.exists():
                    zp.unlink()
    return {"ok": False, "code": "DOWNLOAD_FAILED", "source": None, "sdk": str(sdk), "tried": tried}


def device_check(adb: str, serial: str, run: Callable, run_bytes: Callable) -> Dict[str, Any]:
    dump = "/sdcard/aipm-check-%d.xml" % id(serial)
    try:
        rc_dump, _ = run([adb, "-s", serial, "shell", "uiautomator", "dump", dump], 30)
        rc_xml, xml = run([adb, "-s", serial, "exec-out", "cat", dump], 15)
        rc_png, png = run_bytes([adb, "-s", serial, "exec-out", "screencap", "-p"], 20)
        _, brand = run([adb, "-s", serial, "shell", "getprop", "ro.product.manufacturer"], 10)
        nodes = xml.count("<node") if rc_dump == 0 and rc_xml == 0 else 0
        return {"ui_nodes": nodes, "ui_ok": nodes > 0, "screenshot_ok": rc_png == 0 and png[:8] == PNG_MAGIC,
                "brand": brand.strip().lower()}
    finally:
        run([adb, "-s", serial, "shell", "rm", "-f", dump], 10)
