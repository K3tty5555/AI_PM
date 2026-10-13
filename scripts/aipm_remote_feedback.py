#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Minimal same-origin feedback receiver for remotely published prototypes."""

from __future__ import annotations

import argparse
from http.cookies import SimpleCookie
import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import sys
import threading
import time
from typing import Any
from urllib.parse import parse_qs, urlsplit

try:
    from aipm_prototype_collab import SpecError, feedback_filename, validate_feedback, write_text
except ModuleNotFoundError:  # imported from the repository test runner
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from aipm_prototype_collab import SpecError, feedback_filename, validate_feedback, write_text


MAX_BODY = 2_000_000
MIN_REQUEST_INTERVAL = 0.5


def load_policy(path: Path) -> dict[str, dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SpecError(f"反馈策略读取失败: {path}: {exc}") from exc
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise SpecError("反馈策略 schema_version 必须为 1")
    records = data.get("builds")
    if not isinstance(records, dict):
        raise SpecError("反馈策略 builds 必须是对象")
    return records


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def authorize(policy: dict[str, Any], token: str) -> bool:
    if policy.get("access_mode") == "public" and not policy.get("write_token_hash"):
        return True
    expected = str(policy.get("write_token_hash") or "")
    return bool(token) and secrets.compare_digest(token_digest(token), expected)


def route_key(data: dict[str, Any]) -> str:
    return f"{data.get('project', '')}/{data.get('spec_hash', '')}"


class FeedbackApp:
    def __init__(self, root: Path, policy: dict[str, dict[str, Any]]) -> None:
        self.root = root.resolve()
        self.policy = policy

    def save(self, data: dict[str, Any], token: str) -> str:
        errors = validate_feedback(data)
        if errors:
            raise SpecError("；".join(errors))
        record = self.policy.get(route_key(data))
        if not isinstance(record, dict):
            raise SpecError("当前原型未登记远程反馈策略")
        if not authorize(record, token):
            raise SpecError("反馈写入令牌无效")
        target_root = (self.root / str(record.get("feedback_dir", ""))).resolve()
        if self.root not in target_root.parents:
            raise SpecError("反馈目录越出服务根目录")
        target_root.mkdir(parents=True, exist_ok=True)
        target = target_root / feedback_filename(data)
        if target.exists():
            # Feedback exports are snapshots; preserve every submission.
            target = target_root / f"{target.stem}-{data.get('exported_at', 'submission').replace(':', '').replace('+', '-')}{target.suffix}"
        write_text(target, json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        return target.relative_to(self.root).as_posix()

    def authorize_page(self, path: str, token: str, cookie_header: str = "") -> bool:
        clean_path = urlsplit(path).path
        if not token and cookie_header:
            cookies = SimpleCookie()
            cookies.load(cookie_header)
            token = cookies.get("aipm_access").value if cookies.get("aipm_access") else ""
        for record in self.policy.values():
            prefix = str(record.get("path_prefix") or "")
            if prefix and clean_path.startswith(prefix):
                return authorize(record, token)
        return False


def make_server(app: FeedbackApp, host: str, port: int) -> ThreadingHTTPServer:
    request_times: dict[str, float] = {}
    request_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/__aipm_health__":
                payload = b'{"ok":true}\n'
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            if self.path == "/__aipm_auth__":
                token = self.headers.get("X-AIPM-Access-Token", "")
                allowed = app.authorize_page(self.headers.get("X-AIPM-Path", ""), token, self.headers.get("Cookie", ""))
                self.send_response(200 if allowed else 401)
                if allowed and token:
                    self.send_header("Set-Cookie", "aipm_access=" + token + "; Path=/aipm; HttpOnly; SameSite=Lax; Secure")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_error(404)

        def do_POST(self) -> None:  # noqa: N802
            if urlsplit(self.path).path != "/__aipm_feedback__":
                self.send_error(404)
                return
            try:
                client = self.client_address[0]
                now = time.monotonic()
                with request_lock:
                    previous = request_times.get(client, 0.0)
                    if previous and now - previous < MIN_REQUEST_INTERVAL:
                        raise SpecError("反馈提交过于频繁，请稍后重试")
                    request_times[client] = now
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_BODY:
                    raise SpecError("反馈文件大小非法")
                data = json.loads(self.rfile.read(length).decode("utf-8"))
                if not isinstance(data, dict):
                    raise SpecError("反馈根节点必须是对象")
                token = self.headers.get("X-AIPM-Feedback-Token", "")
                if not token:
                    token = parse_qs(urlsplit(self.path).query).get("aipm_write_token", [""])[0]
                relative = app.save(data, token)
                payload = json.dumps({"ok": True, "path": relative}, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
            except (SpecError, json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
                payload = json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False).encode("utf-8")
                self.send_response(400)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, fmt: str, *values: Any) -> None:
            print(f"[aipm-feedback] {fmt % values}", flush=True)

    return ThreadingHTTPServer((host, port), Handler)


def serve(app: FeedbackApp, host: str, port: int) -> None:
    server = make_server(app, host, port)
    print(f"FEEDBACK: http://{host}:{port}/__aipm_feedback__", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main() -> int:
    parser = argparse.ArgumentParser(description="AI_PM 远程原型反馈服务")
    parser.add_argument("--root", required=True, help="反馈文件根目录")
    parser.add_argument("--policy", required=True, help="远程构建反馈策略 JSON")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8876)
    args = parser.parse_args()
    try:
        serve(FeedbackApp(Path(args.root), load_policy(Path(args.policy))), args.host, args.port)
    except (SpecError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
