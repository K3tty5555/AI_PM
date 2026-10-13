#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Package and validate an AI_PM prototype for remote review.

This module deliberately keeps server mutation behind ``publish --execute``.
The default path only builds a deterministic bundle and deployment plan.  A
future/installed server can serve the bundle through Nginx and proxy the
feedback endpoint to ``aipm_remote_feedback.py``.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import secrets
import shlex
import subprocess
import sys
import tarfile
import tempfile
from typing import Any, Iterable
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = 1
BUILD_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{7,63}$")
ACCESS_MODES = {"public", "token"}
EXCLUDED_DIRS = {"feedback", ".git", "__pycache__"}
EXCLUDED_SUFFIXES = {".bak", ".tmp"}
EXCLUDED_NAMES = {".DS_Store"}
REMOTE_OUTPUT_NAMES = {"remote-publish.json", "remote-feedback-policy.json"}


class RemotePublishError(ValueError):
    pass


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iso_now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def safe_project(value: str) -> str:
    value = str(value or "").strip()
    if not value or len(value) > 120 or "/" in value or "\\" in value or value in {".", ".."}:
        raise RemotePublishError("project 必须是非空、单层路径名称")
    if any(ord(char) < 32 for char in value):
        raise RemotePublishError("project 不能包含控制字符")
    return value


def safe_relative(path: Path, root: Path) -> str:
    try:
        relative = path.relative_to(root)
    except ValueError as exc:
        raise RemotePublishError(f"文件越出原型目录: {path}") from exc
    if path.is_symlink():
        raise RemotePublishError(f"不允许发布软链接: {relative}")
    parts = PurePosixPath(relative.as_posix()).parts
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise RemotePublishError(f"非法相对路径: {relative}")
    return "/".join(parts)


def iter_publish_files(root: Path) -> Iterable[tuple[str, Path]]:
    root = root.resolve()
    if not root.is_dir():
        raise RemotePublishError(f"原型目录不存在: {root}")
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = safe_relative(path, root)
        parts = set(PurePosixPath(relative).parts)
        if parts & EXCLUDED_DIRS or path.name in EXCLUDED_NAMES or path.name in REMOTE_OUTPUT_NAMES:
            continue
        if path.suffix.lower() in EXCLUDED_SUFFIXES or path.name.endswith(".pre-annotation.bak") or (path.name.startswith("remote-publish-") and path.name.endswith((".tar.gz", ".json"))):
            continue
        # Publishing credentials or private material would be an unsafe default.
        lowered = path.name.lower()
        if lowered in {".env", ".env.local", "id_rsa", "id_ed25519"} or lowered.endswith((".pem", ".key")):
            raise RemotePublishError(f"疑似凭据文件，拒绝发布: {relative}")
        yield relative, path


def content_hashes(root: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for relative, path in iter_publish_files(root):
        records.append({"path": relative, "size": path.stat().st_size, "sha256": sha256_file(path)})
    if not records:
        raise RemotePublishError("原型目录没有可发布文件")
    return records


def build_id_for(records: list[dict[str, Any]], spec_hash: str) -> str:
    payload = {"spec_hash": spec_hash, "files": records}
    return "b-" + sha256_bytes(canonical_json(payload).encode("utf-8"))[:24]


def validate_manifest(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if data.get("schema_version") != SCHEMA_VERSION:
        errors.append("schema_version 必须为 1")
    try:
        safe_project(str(data.get("project", "")))
    except RemotePublishError as exc:
        errors.append(str(exc))
    for field in ("spec_hash", "prototype_hash", "created_at"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            errors.append(f"{field} 必须填写")
    if not isinstance(data.get("spec_hash"), str) or not re.fullmatch(r"[0-9a-f]{64}", data.get("spec_hash", "")):
        errors.append("spec_hash 必须是 SHA-256")
    if not isinstance(data.get("prototype_hash"), str) or not re.fullmatch(r"[0-9a-f]{64}", data.get("prototype_hash", "")):
        errors.append("prototype_hash 必须是 SHA-256")
    if not isinstance(data.get("build_id"), str) or not BUILD_RE.fullmatch(data.get("build_id", "")):
        errors.append("build_id 格式非法")
    if data.get("access_mode") not in ACCESS_MODES:
        errors.append("access_mode 必须是 public 或 token")
    files = data.get("files")
    if not isinstance(files, list) or not files:
        errors.append("files 必须是非空数组")
    else:
        seen: set[str] = set()
        for index, item in enumerate(files):
            if not isinstance(item, dict):
                errors.append(f"files[{index}] 必须是对象")
                continue
            path = item.get("path")
            if not isinstance(path, str) or not path or path in seen or path.startswith("/") or ".." in PurePosixPath(path).parts:
                errors.append(f"files[{index}].path 非法或重复")
            if isinstance(path, str):
                seen.add(path)
            if not isinstance(item.get("size"), int) or item["size"] < 0:
                errors.append(f"files[{index}].size 必须是非负整数")
            if not isinstance(item.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", "")):
                errors.append(f"files[{index}].sha256 必须是 SHA-256")
    urls = data.get("urls")
    if not isinstance(urls, dict) or not all(isinstance(urls.get(key), str) and urls[key].strip() for key in ("lowfi", "prototype", "review")):
        errors.append("urls 必须包含 lowfi/prototype/review")
    return errors


def build_manifest(
    prototype_root: Path,
    project: str,
    spec_hash: str,
    prototype_hash: str,
    base_url: str,
    access_mode: str = "public",
    build_id: str | None = None,
) -> dict[str, Any]:
    project = safe_project(project)
    base_url = base_url.rstrip("/")
    if not base_url.startswith("https://"):
        raise RemotePublishError("base_url 必须使用 HTTPS")
    if access_mode not in ACCESS_MODES:
        raise RemotePublishError("access_mode 必须是 public 或 token")
    records = content_hashes(prototype_root)
    selected_build = build_id or build_id_for(records, spec_hash)
    if not BUILD_RE.fullmatch(selected_build):
        raise RemotePublishError("build_id 格式非法")
    prefix = f"{base_url}/aipm/{quote(project, safe='')}/{selected_build}"
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "project": project,
        "build_id": selected_build,
        "spec_hash": spec_hash,
        "prototype_hash": prototype_hash,
        "access_mode": access_mode,
        "created_at": iso_now(),
        "urls": {
            "lowfi": f"{prefix}/lowfi/index.html",
            "prototype": f"{prefix}/index.html",
            "review": f"{prefix}/review/index.html",
        },
        "feedback": {"endpoint": f"{base_url}/__aipm_feedback__", "remote_write": True},
        "files": records,
    }
    errors = validate_manifest(manifest)
    if errors:
        raise RemotePublishError("；".join(errors))
    return manifest


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def make_bundle(root: Path, manifest: dict[str, Any], output: Path) -> Path:
    errors = validate_manifest(manifest)
    if errors:
        raise RemotePublishError("；".join(errors))
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix="aipm-remote-publish-"))
    try:
        build_root = staging / manifest["build_id"]
        build_root.mkdir()
        for item in manifest["files"]:
            source = root / item["path"]
            if not source.is_file() or source.is_symlink():
                raise RemotePublishError(f"发布文件发生变化或不存在: {item['path']}")
            target = build_root / item["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            if target.stat().st_size != item["size"] or sha256_file(target) != item["sha256"]:
                raise RemotePublishError(f"文件校验失败: {item['path']}")
        write_json(build_root / "aipm-remote-publish.json", manifest)
        temp_output = output.with_name(output.name + ".tmp")
        with tarfile.open(temp_output, "w:gz") as archive:
            archive.add(build_root, arcname=manifest["build_id"])
        temp_output.replace(output)
        return output
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def deployment_plan(manifest: dict[str, Any], bundle: Path, remote_target: str, remote_root: str, policy: Path | None = None) -> list[str]:
    errors = validate_manifest(manifest)
    if errors:
        raise RemotePublishError("；".join(errors))
    if not remote_target or "\n" in remote_target or "\r" in remote_target:
        raise RemotePublishError("remote_target 非法")
    if not remote_root.startswith("/") or "\n" in remote_root or "\r" in remote_root:
        raise RemotePublishError("remote_root 必须是绝对路径")
    build = manifest["build_id"]
    remote_tmp = f"{remote_root}/.incoming/{build}.tar.gz"
    remote_bundle = f"{remote_root}/.incoming/{build}.tar.gz"
    target = shlex.quote(remote_target)
    root = shlex.quote(remote_root)
    project_root = shlex.quote(f"{remote_root}/{manifest['project']}")
    remote_tmp_q = shlex.quote(f"{remote_target}:{remote_tmp}")
    remote_policy_q = shlex.quote(f"{remote_target}:{remote_root}/.incoming/remote-feedback-policy.json")
    bundle_q = shlex.quote(str(bundle))
    review_q = shlex.quote(manifest["urls"]["review"])
    lines = [
        f"ssh {target} mkdir -p {root}/.incoming {project_root}",
        f"rsync -av --checksum {bundle_q} {remote_tmp_q}",
    ]
    if policy is not None:
        if not policy.is_file():
            raise RemotePublishError(f"policy 不存在: {policy}")
        lines.append(f"rsync -av --checksum {shlex.quote(str(policy))} {remote_policy_q}")
        lines.append(
            f"ssh {target} aipm-remote-install --bundle {shlex.quote(remote_bundle)} --root {project_root} --build {shlex.quote(build)} --policy {shlex.quote(f'{remote_root}/.incoming/remote-feedback-policy.json')}"
        )
    else:
        lines.append(f"ssh {target} aipm-remote-install --bundle {shlex.quote(remote_bundle)} --root {project_root} --build {shlex.quote(build)}")
    lines.append(f"curl --fail --silent --show-error {review_q}")
    return lines


def command_prepare(args: argparse.Namespace) -> int:
    prototype_root = Path(args.prototype).resolve()
    manifest = build_manifest(prototype_root, args.project, args.spec_hash, args.prototype_hash, args.base_url, args.access_mode, args.build_id)
    out_dir = Path(args.out).resolve() if args.out else prototype_root
    manifest_path = out_dir / "remote-publish.json"
    bundle_path = out_dir / f"remote-publish-{manifest['build_id']}.tar.gz"
    access_token = secrets.token_urlsafe(32) if args.access_mode == "token" else ""
    policy_path = out_dir / "remote-feedback-policy.json"
    policy = {
        "schema_version": 1,
        "builds": {
            f"{manifest['project']}/{manifest['spec_hash']}": {
                "build_id": manifest["build_id"],
                "access_mode": manifest["access_mode"],
                "path_prefix": f"/aipm/{quote(manifest['project'], safe='')}/{manifest['build_id']}/",
                "write_token_hash": hashlib.sha256(access_token.encode("utf-8")).hexdigest() if access_token else "",
                "feedback_dir": f"{manifest['project']}/{manifest['build_id']}/feedback",
            }
        },
    }
    write_json(manifest_path, manifest)
    write_json(policy_path, policy)
    make_bundle(prototype_root, manifest, bundle_path)
    print(f"MANIFEST: {manifest_path}")
    print(f"BUNDLE: {bundle_path}")
    print(f"REVIEW: {manifest['urls']['review']}")
    print(f"ACCESS_MODE: {manifest['access_mode']}")
    print(f"POLICY: {policy_path}")
    if access_token:
        print(f"ACCESS_TOKEN: {access_token}")
        print(f"SHARE_LOFI: {manifest['urls']['lowfi']}?aipm_write_token={access_token}")
        print(f"SHARE_PROTOTYPE: {manifest['urls']['prototype']}?aipm_write_token={access_token}")
        print(f"SHARE_REVIEW: {manifest['urls']['review']}?aipm_write_token={access_token}")
    return 0


def command_plan(args: argparse.Namespace) -> int:
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    bundle = Path(args.bundle).resolve()
    if not bundle.is_file():
        raise RemotePublishError(f"bundle 不存在: {bundle}")
    for line in deployment_plan(manifest, bundle, args.remote_target, args.remote_root, Path(args.policy).resolve() if args.policy else None):
        print(line)
    return 0


def feedback_pull_plan(manifest: dict[str, Any], remote_target: str, remote_root: str, out: Path) -> list[str]:
    errors = validate_manifest(manifest)
    if errors:
        raise RemotePublishError("；".join(errors))
    if not remote_target or "\n" in remote_target or "\r" in remote_target:
        raise RemotePublishError("remote_target 非法")
    if not remote_root.startswith("/") or "\n" in remote_root or "\r" in remote_root:
        raise RemotePublishError("remote_root 必须是绝对路径")
    out = out.resolve()
    remote_feedback = f"{remote_target}:{remote_root}/{manifest['project']}/{manifest['build_id']}/feedback/"
    return [
        f"mkdir -p {shlex.quote(str(out))}",
        f"rsync -av --ignore-existing {shlex.quote(remote_feedback)} {shlex.quote(str(out))}/",
    ]


def command_pull(args: argparse.Namespace) -> int:
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    out = Path(args.out).resolve()
    commands = feedback_pull_plan(manifest, args.remote_target, args.remote_root, out)
    if not args.execute:
        for line in commands:
            print(line)
        return 0
    out.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(commands[1], shell=True, check=False)
    if result.returncode:
        raise RemotePublishError(f"反馈拉回失败，退出码 {result.returncode}")
    print(f"FEEDBACK: {out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI_PM 原型远程发布打包与部署计划工具")
    sub = parser.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("prepare", help="生成远程发布清单和不可变 bundle")
    prepare.add_argument("--prototype", required=True, help="06-prototype 目录")
    prepare.add_argument("--project", required=True)
    prepare.add_argument("--spec-hash", required=True)
    prepare.add_argument("--prototype-hash", required=True)
    prepare.add_argument("--base-url", required=True)
    prepare.add_argument("--access-mode", choices=sorted(ACCESS_MODES), default="public")
    prepare.add_argument("--build-id")
    prepare.add_argument("--out", help="输出目录，缺省写入 prototype 目录")
    prepare.set_defaults(func=command_prepare)
    plan = sub.add_parser("plan", help="输出 SSH/rsync 原子发布计划，不执行远程命令")
    plan.add_argument("--manifest", required=True)
    plan.add_argument("--bundle", required=True)
    plan.add_argument("--remote-target", required=True, help="SSH host，例如 ubuntu@server")
    plan.add_argument("--remote-root", default="/srv/aipm")
    plan.add_argument("--policy", help="remote-feedback-policy.json；会随构建合并到服务器")
    plan.set_defaults(func=command_plan)
    pull = sub.add_parser("pull", help="生成或执行远程反馈拉回计划")
    pull.add_argument("--manifest", required=True)
    pull.add_argument("--remote-target", required=True)
    pull.add_argument("--remote-root", default="/srv/aipm")
    pull.add_argument("--out", required=True, help="本地 feedback/ 目录")
    pull.add_argument("--execute", action="store_true", help="明确执行 rsync；缺省只输出计划")
    pull.set_defaults(func=command_pull)
    return parser


def main() -> int:
    try:
        args = build_parser().parse_args()
        return int(args.func(args))
    except (RemotePublishError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
