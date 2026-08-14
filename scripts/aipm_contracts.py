#!/usr/bin/env python3
"""Validate AI_PM next-generation project contracts without modifying projects."""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import sys
from pathlib import Path

from aipm_core import (
    CAPABILITY_REGISTRY,
    atomic_write_json,
    discover_reconcilable_artifacts,
    load_json,
    resolve_project,
    resolve_artifact_path,
    sha256_file,
    validate_baseline,
    validate_capability_registry,
    validate_status_artifacts,
)


DETAIL_HEADING_RE = re.compile(r"^##\s+(?:六[、.]?|6[.、]?\s*)?详细功能设计\s*$", re.M)
SUBSECTION_RE = re.compile(r"^###\s+\d+\.\d+\s+.+$", re.M)
NEXT_H2_RE = re.compile(r"^##\s+", re.M)
DECISION_DOCTYPES = {"decision-review", "decision_review", "decision"}


def _artifact_type(path: str) -> tuple[str, str]:
    if path.startswith("05-prd/"):
        return "prd", "prd"
    if path.startswith("06-prototype/"):
        return "prototype", "prototype"
    if path.startswith("08-reviews/"):
        return "review", "review"
    if path.startswith("09-analytics/"):
        return "metric", "data"
    if path.startswith("13-release-docs/"):
        return "release-doc", "orchestrate"
    if path.startswith("14-acceptance/"):
        return "acceptance", "acceptance"
    return "other", "orchestrate"


def _artifact_id(path: str, artifact_type: str, active_prd: str | None) -> str:
    if artifact_type == "prd" and active_prd and path == f"05-prd/{active_prd}":
        return "prd.current"
    if artifact_type == "prototype" and path == "06-prototype/index.html":
        return "prototype.current"
    suffix = hashlib.sha256(path.encode("utf-8")).hexdigest()[:10]
    return f"{artifact_type}.{suffix}"


def build_bootstrap(project: Path, project_type: str) -> tuple[dict, list[dict]]:
    status = load_json(project / "_status.json")
    now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    sources: list[dict] = []
    source_paths: list[Path] = []
    delta = project / "01-baseline-delta.md"
    if delta.is_file():
        source_paths.append(delta)
    references = project / "07-references"
    if references.is_dir():
        source_paths.extend(
            path for path in sorted(references.rglob("*"))
            if path.is_file() and path.name.lower() != "readme.md"
        )
    active_prd = status.get("active_prd") if isinstance(status.get("active_prd"), str) else None
    if active_prd:
        prd_path = project / "05-prd" / active_prd
        if prd_path.is_file() and prd_path not in source_paths:
            source_paths.append(prd_path)
    for index, path in enumerate(source_paths, start=1):
        rel = path.relative_to(project).as_posix()
        sources.append({
            "source_id": f"source.{index:03d}",
            "kind": "project-document" if rel == "01-baseline-delta.md" or rel.startswith("05-prd/") else "historical",
            "path_or_remote_id": rel,
            "observed_at": datetime.datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat(timespec="seconds"),
            "content_hash": sha256_file(path),
            "authority": "confirmed" if rel == "01-baseline-delta.md" else "candidate",
        })
    baseline = {
        "schema_version": 1,
        "project": status.get("project") or project.name,
        "project_type": project_type,
        "generated_at": now,
        "sources": sources,
        "claims": [],
        "open_questions": [{
            "question_id": "baseline.claims.pending",
            "text": "请从已确认来源提取当前事实、目标、决策和高风险假设后再通过 baseline gate",
            "risk": "high",
            "owner": "pm",
        }],
    }
    artifacts: list[dict] = []
    for path in discover_reconcilable_artifacts(project):
        artifact_type, producer = _artifact_type(path)
        artifacts.append({
            "artifact_id": _artifact_id(path, artifact_type, active_prd),
            "type": artifact_type,
            "path_or_remote_id": path,
            "authoritative_source": "local-primary",
            "version_or_hash": sha256_file(project / path),
            "producer_capability": producer,
            "dependencies": [],
            "owner": "shared",
            "status": "current",
            "last_verified_at": now,
        })
    return baseline, artifacts


def _frontmatter_doctype(text: str) -> str:
    if not text.startswith("---\n"):
        return ""
    end = text.find("\n---", 4)
    if end < 0:
        return ""
    match = re.search(r"^doctype:\s*['\"]?([^'\"\s]+)", text[4:end], re.M)
    return match.group(1).strip() if match else ""


def validate_prd(path: Path, doctype: str | None = None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    text = path.read_text(encoding="utf-8", errors="replace")
    actual_doctype = doctype or _frontmatter_doctype(text) or "full"
    if actual_doctype in DECISION_DOCTYPES:
        if DETAIL_HEADING_RE.search(text):
            warnings.append("决策评审型 PRD 出现详细功能设计；确认是否误套完整功能模板")
        return errors, warnings

    for label, pattern in (
        ("文档概述", r"^##\s+(?:一[、.]?|1[.、]?\s*)?文档概述"),
        ("需求分析", r"^##\s+(?:二[、.]?|2[.、]?\s*)?需求分析"),
        ("功能清单", r"^##\s+(?:三[、.]?|3[.、]?\s*)?功能清单"),
    ):
        if not re.search(pattern, text, re.M):
            errors.append(f"完整功能 PRD 缺少承重章节: {label}")

    heading = DETAIL_HEADING_RE.search(text)
    if not heading:
        errors.append("完整功能 PRD 缺少详细功能设计章节")
        return errors, warnings
    tail = text[heading.end():]
    next_h2 = NEXT_H2_RE.search(tail)
    detail = tail[:next_h2.start()] if next_h2 else tail
    sections = list(SUBSECTION_RE.finditer(detail))
    if not sections:
        errors.append("详细功能设计没有任何 6.x 功能小节")
        return errors, warnings

    required_rows = ["用户场景", "功能描述", "原型示意", "影响范围"]
    for index, match in enumerate(sections):
        end = sections[index + 1].start() if index + 1 < len(sections) else len(detail)
        block = detail[match.start():end]
        title = match.group(0).lstrip("# ")
        if not re.search(r"^\|\s*项目\s*\|\s*说明\s*\|", block, re.M):
            errors.append(f"{title} 未使用『项目｜说明』两列表")
            continue
        for row in required_rows:
            row_match = re.search(rf"^\|\s*\*\*{re.escape(row)}\*\*\s*\|(.+?)\|\s*$", block, re.M)
            if not row_match:
                errors.append(f"{title} 缺少必填行: {row}")
            elif not row_match.group(1).strip() or re.search(r"\{\{|待填写|TODO", row_match.group(1), re.I):
                errors.append(f"{title} 的 {row} 仍为空或含占位符")
    return errors, warnings


def validate_prototype_manifest(project: Path) -> tuple[list[str], list[str]]:
    path = project / "06-prototype" / "source-target-manifest.json"
    if not path.exists():
        return [f"缺少原型 source/target manifest: {path.relative_to(project)}"], []
    data = load_json(path)
    errors: list[str] = []
    warnings: list[str] = []
    if data.get("schema_version") != 1:
        errors.append("prototype manifest schema_version 必须为 1")
    if not isinstance(data.get("project"), str) or not data["project"].strip():
        errors.append("prototype manifest project 必须填写")
    if not isinstance(data.get("generated_at"), str) or len(data["generated_at"].strip()) < 10:
        errors.append("prototype manifest generated_at 必须填写")
    devices = data.get("devices")
    if not isinstance(devices, list) or not devices:
        errors.append("prototype manifest devices 必须是非空数组")
        return errors, warnings
    seen: set[str] = set()
    for index, device in enumerate(devices):
        prefix = f"devices[{index}]"
        if not isinstance(device, dict):
            errors.append(f"{prefix} 必须是 object")
            continue
        name = device.get("device")
        if name not in {"web", "mobile"}:
            errors.append(f"{prefix}.device 非法: {name}")
        if name in seen:
            errors.append(f"device 重复: {name}")
        seen.add(str(name))
        status = device.get("evidence_status")
        if status not in {"verified", "missing", "not-applicable"}:
            errors.append(f"{prefix}.evidence_status 非法: {status}")
        for field in ("source_evidence", "current_state", "target_changes", "unchanged"):
            if not isinstance(device.get(field), list):
                errors.append(f"{prefix}.{field} 必须是数组")
        if status == "verified" and not device.get("source_evidence"):
            errors.append(f"{prefix} 标为 verified 但没有 source_evidence")
        if status == "missing":
            warnings.append(f"{prefix} 缺少当前产品证据，不能宣称完成该端适配")
    missing_devices = sorted({"web", "mobile"} - seen)
    if missing_devices:
        errors.append(f"prototype manifest 必须分别声明 Web/Mobile；缺少: {', '.join(missing_devices)}")
    return errors, warnings


def validate_cloud_ownership(project: Path, operation: str) -> tuple[list[str], list[str]]:
    status = load_json(project / "_status.json")
    errors, warnings = validate_status_artifacts(status, project)
    active_prd = status.get("active_prd")
    if not isinstance(active_prd, str) or not active_prd:
        errors.append("status.active_prd 未登记，无法确定云文档操作对象")
        return errors, warnings
    target = f"05-prd/{active_prd}"
    matches = [
        item for item in status.get("artifacts", [])
        if isinstance(item, dict) and item.get("type") == "prd" and item.get("path_or_remote_id") == target
    ]
    if len(matches) != 1:
        errors.append(f"当前 PRD 必须且只能有一条 artifact 登记: {target}（实际 {len(matches)}）")
        return errors, warnings
    artifact = matches[0]
    authority = artifact.get("authoritative_source")
    path = resolve_artifact_path(project, target)
    if path is None or not path.is_file():
        errors.append(f"当前 PRD 文件不存在，禁止云文档操作: {target}")
        return errors, warnings
    version = str(artifact.get("version_or_hash", ""))
    hash_match = re.fullmatch(r"(?:sha256:)?([0-9a-f]{64})", version, re.I)
    if path and hash_match:
        if sha256_file(path).casefold() != hash_match.group(1).casefold():
            errors.append("artifact.version_or_hash 与当前 PRD 内容不一致，先重新 preview/登记")
    if operation == "publish":
        if authority == "cloud-primary":
            errors.append("当前 PRD 为 cloud-primary，禁止用本地稿直接 publish；先 pull/reconcile")
        elif authority == "mixed":
            errors.append("当前 PRD 为 mixed；现有适配器不支持稳定块级 apply，默认阻断整篇 publish")
        elif authority == "external-reference":
            errors.append("当前 PRD 是 external-reference，不能作为发布正本")
        elif authority == "local-primary":
            warnings.append("local-primary 可进入现有 prd_publish 预览；仍须 hash/revision/baseline 和写后读回全部通过")
    elif operation == "pull":
        if authority == "external-reference":
            errors.append("external-reference 不支持 pull 回写")
        elif authority == "mixed":
            warnings.append("mixed 只允许现有 prd_pull 冲突预览；默认不 apply")
        else:
            warnings.append("pull 仍由现有 prd_pull 三方合并与有损保护决定是否可 apply")
    else:
        errors.append(f"未知 cloud operation: {operation}")
    return errors, warnings


def _print_result(name: str, errors: list[str], warnings: list[str]) -> int:
    print(f"# {name}")
    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    if not errors:
        print(f"PASS: {name}（warning={len(warnings)}）")
    return 1 if errors else 0


def selftest() -> int:
    from tempfile import TemporaryDirectory

    with TemporaryDirectory(prefix="aipm-contracts-") as raw:
        root = Path(raw)
        good = root / "good.md"
        good.write_text(
            "# 示例\n\n## 一、文档概述\n\n## 二、需求分析\n\n## 三、功能清单\n\n"
            "## 六、详细功能设计\n\n### 6.1 示例功能\n\n"
            "| 项目 | 说明 |\n|---|---|\n| **用户场景** | 用户处理任务 |\n"
            "| **功能描述** | 完成处理 |\n| **原型示意** | 无界面交互（后台规则） |\n"
            "| **影响范围** | 任务页、管理员 |\n",
            encoding="utf-8",
        )
        assert validate_prd(good) == ([], []), validate_prd(good)
        bad = root / "bad.md"
        bad.write_text("# 示例\n\n## 六、详细功能设计\n\n### 6.1 示例\n\n长段落\n", encoding="utf-8")
        errors, _ = validate_prd(bad)
        assert any("两列表" in item for item in errors), errors
        assert any("文档概述" in item for item in errors), errors
    print("aipm_contracts selftest: OK")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("selftest")
    sub.add_parser("capabilities")
    status_parser = sub.add_parser("status")
    status_parser.add_argument("--project", required=True)
    baseline_parser = sub.add_parser("baseline")
    baseline_parser.add_argument("--project", required=True)
    prd_parser = sub.add_parser("prd")
    prd_parser.add_argument("--file", required=True)
    prd_parser.add_argument("--doctype")
    prototype_parser = sub.add_parser("prototype")
    prototype_parser.add_argument("--project", required=True)
    cloud_parser = sub.add_parser("cloud")
    cloud_parser.add_argument("--project", required=True)
    cloud_parser.add_argument("--operation", required=True, choices=["publish", "pull"])
    bootstrap_parser = sub.add_parser("bootstrap")
    bootstrap_parser.add_argument("--project", required=True)
    bootstrap_parser.add_argument("--type", required=True, choices=["zero-to-one", "iteration", "import"])
    bootstrap_parser.add_argument("--apply", action="store_true")
    project_parser = sub.add_parser("project")
    project_parser.add_argument("--project", required=True)
    args = parser.parse_args()

    try:
        if args.command == "selftest":
            return selftest()
        if args.command == "capabilities":
            errors, warnings = validate_capability_registry(load_json(CAPABILITY_REGISTRY))
            return _print_result("capability registry", errors, warnings)
        if args.command == "prd":
            path = Path(args.file).expanduser().resolve()
            return _print_result("PRD contract", *validate_prd(path, args.doctype))

        project = resolve_project(args.project)
        if args.command == "bootstrap":
            status_path = project / "_status.json"
            status = load_json(status_path)
            baseline_path = project / "01-baseline-manifest.json"
            if baseline_path.exists() or status.get("artifacts") or status.get("baseline"):
                raise ValueError("项目已有 baseline/artifacts 登记；bootstrap 不覆盖，请人工合并")
            baseline, artifacts = build_bootstrap(project, args.type)
            preview = {"baseline": baseline, "artifacts": artifacts}
            if not args.apply:
                print(json.dumps(preview, ensure_ascii=False, indent=2))
                print("PREVIEW: 未写入；确认后追加 --apply", file=sys.stderr)
                return 0
            atomic_write_json(baseline_path, baseline)
            status["baseline"] = {"manifest": "01-baseline-manifest.json"}
            status["artifacts"] = artifacts
            atomic_write_json(status_path, status)
            print(f"APPLIED: {baseline_path}；登记 artifacts={len(artifacts)}（claims 仍须 PM 补齐）")
            return 0
        if args.command == "status":
            status = load_json(project / "_status.json")
            return _print_result("artifact registry", *validate_status_artifacts(status, project))
        if args.command == "baseline":
            baseline = load_json(project / "01-baseline-manifest.json")
            return _print_result("baseline manifest", *validate_baseline(baseline))
        if args.command == "prototype":
            return _print_result("prototype source/target", *validate_prototype_manifest(project))
        if args.command == "cloud":
            return _print_result("cloud ownership", *validate_cloud_ownership(project, args.operation))
        if args.command == "project":
            status = load_json(project / "_status.json")
            errors, warnings = validate_status_artifacts(status, project)
            baseline_path = project / "01-baseline-manifest.json"
            if baseline_path.exists():
                be, bw = validate_baseline(load_json(baseline_path))
                errors.extend(be)
                warnings.extend(bw)
            elif status.get("baseline"):
                errors.append("status 已登记 baseline，但 01-baseline-manifest.json 不存在")
            return _print_result("project contracts", errors, warnings)
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
