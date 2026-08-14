#!/usr/bin/env python3
"""Read-only cross-artifact reconciliation for AI_PM projects."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from aipm_core import (
    claim_terms,
    discover_reconcilable_artifacts,
    load_json,
    read_searchable_text,
    registered_local_paths,
    resolve_artifact_path,
    resolve_project,
    sha256_file,
    validate_baseline,
    validate_status_artifacts,
)


ISSUE_STATES = {"stale", "conflict", "pending-decision", "coverage-gap"}
SHA256_RE = re.compile(r"^(?:sha256:)?([0-9a-f]{64})$", re.I)


def reconcile(project: Path) -> dict[str, Any]:
    project = project.resolve()
    status = load_json(project / "_status.json")
    baseline = load_json(project / "01-baseline-manifest.json")
    status_errors, status_warnings = validate_status_artifacts(status, project)
    baseline_errors, baseline_warnings = validate_baseline(baseline)

    claims = [c for c in baseline.get("claims", []) if isinstance(c, dict)]
    change_claims = [c for c in claims if c.get("state") in {"removed", "changed", "unknown"}]
    results: list[dict[str, Any]] = []

    for artifact in status.get("artifacts", []):
        if not isinstance(artifact, dict):
            continue
        artifact_id = artifact.get("artifact_id", "unknown")
        ref = str(artifact.get("path_or_remote_id", ""))
        deps = set(str(x) for x in artifact.get("dependencies", []))
        matched_claims = [c for c in change_claims if c.get("claim_id") in deps]
        try:
            local_path = resolve_artifact_path(project, ref)
        except ValueError as exc:
            results.append({
                "artifact_id": artifact_id,
                "path_or_remote_id": ref,
                "state": "coverage-gap",
                "reasons": [str(exc)],
                "claim_ids": [],
            })
            continue

        if local_path is None:
            state = "pending-decision" if matched_claims else "aligned"
            reasons = (["远端产物无法在只读本地扫描中核实，需走对应适配器预览"] if matched_claims else [])
            results.append({
                "artifact_id": artifact_id,
                "path_or_remote_id": ref,
                "state": state,
                "reasons": reasons,
                "claim_ids": [c.get("claim_id") for c in matched_claims],
            })
            continue
        if not local_path.exists():
            results.append({
                "artifact_id": artifact_id,
                "path_or_remote_id": ref,
                "state": "coverage-gap",
                "reasons": ["登记产物不存在"],
                "claim_ids": [c.get("claim_id") for c in matched_claims],
            })
            continue

        text = read_searchable_text(local_path)
        hits: list[str] = []
        implicit_claims: list[str] = []
        reasons: list[str] = []
        state = "aligned"
        registered_version = str(artifact.get("version_or_hash", "")).strip()
        registered_hash = SHA256_RE.match(registered_version)
        if registered_hash and local_path.is_file():
            current_hash = sha256_file(local_path)
            if current_hash.casefold() != registered_hash.group(1).casefold():
                state = "pending-decision"
                reasons.append("本地内容与登记哈希不同；需确认这是合法编辑、外部回写还是冲突")
        for claim in change_claims:
            terms = claim_terms(claim)
            term_hits = [term for term in terms if text is not None and term.casefold() in text.casefold()]
            is_dependency = claim.get("claim_id") in deps
            if term_hits:
                hits.extend(term_hits)
                if not is_dependency:
                    implicit_claims.append(str(claim.get("claim_id")))
            if claim.get("state") == "removed" and term_hits:
                state = "stale"
                reasons.append(f"已删除范围仍有残留: {', '.join(term_hits)}")
            elif is_dependency and claim.get("state") in {"changed", "unknown"} and state != "stale":
                state = "pending-decision"
                reasons.append(f"依赖的 claim 状态为 {claim.get('state')}，需人工确认新口径")
        if implicit_claims:
            reasons.append(f"正文命中但 dependencies 未登记: {', '.join(sorted(set(implicit_claims)))}")
        results.append({
            "artifact_id": artifact_id,
            "path_or_remote_id": ref,
            "state": state,
            "reasons": reasons,
            "claim_ids": sorted(set([str(c.get("claim_id")) for c in matched_claims] + implicit_claims)),
            "term_hits": sorted(set(hits)),
        })

    registered = registered_local_paths(project, status)
    for path in discover_reconcilable_artifacts(project):
        if path not in registered:
            results.append({
                "artifact_id": None,
                "path_or_remote_id": path,
                "state": "coverage-gap",
                "reasons": ["发现可核对产物，但尚未登记到 _status.json.artifacts"],
                "claim_ids": [],
            })

    if status_errors or baseline_errors:
        results.insert(0, {
            "artifact_id": None,
            "path_or_remote_id": None,
            "state": "conflict",
            "reasons": status_errors + baseline_errors,
            "claim_ids": [],
        })

    counts: dict[str, int] = {}
    for item in results:
        counts[item["state"]] = counts.get(item["state"], 0) + 1
    return {
        "schema_version": 1,
        "mode": "preview",
        "project": status.get("project") or project.name,
        "baseline": "01-baseline-manifest.json",
        "summary": counts,
        "results": results,
        "warnings": status_warnings + baseline_warnings,
        "coverage": {
            "registered_artifacts": len(status.get("artifacts", [])),
            "discovered_reconcilable_files": len(discover_reconcilable_artifacts(project)),
            "promise": "只在已登记产物范围内列全；coverage-gap 不计入通过",
        },
    }


def render_human(report: dict[str, Any]) -> str:
    lines = [
        f"# Reconcile Preview · {report['project']}",
        "",
        "本命令只读，不会修改 PRD、原型、云文档、status 或 memory。",
        "",
        "| 状态 | 产物 | 原因 |",
        "|---|---|---|",
    ]
    for item in report["results"]:
        reason = "；".join(item.get("reasons") or []) or "—"
        target = item.get("path_or_remote_id") or "项目契约"
        escaped_reason = reason.replace("|", "\\|")
        lines.append(f"| {item['state']} | `{target}` | {escaped_reason} |")
    lines.extend(["", "## 汇总"])
    for key in ("aligned", "stale", "conflict", "pending-decision", "coverage-gap"):
        lines.append(f"- {key}: {report['summary'].get(key, 0)}")
    for warning in report.get("warnings", []):
        lines.append(f"- WARN: {warning}")
    lines.append(f"- 覆盖口径：{report['coverage']['promise']}")
    return "\n".join(lines) + "\n"


def selftest() -> int:
    import tempfile

    with tempfile.TemporaryDirectory(prefix="aipm-reconcile-") as raw:
        project = Path(raw)
        (project / "05-prd").mkdir()
        (project / "06-prototype").mkdir()
        (project / "08-reviews").mkdir()
        (project / "05-prd" / "current.md").write_text("# 当前需求\n\n范围已删除。\n", encoding="utf-8")
        (project / "06-prototype" / "index.html").write_text("<button>AI 辅助评分</button>\n", encoding="utf-8")
        (project / "08-reviews" / "current.md").write_text("# 当前评审\n\n已核对。\n", encoding="utf-8")
        (project / "_status.json").write_text(json.dumps({
            "schema_version": 1,
            "project": "示例项目",
            "lifecycle": "active",
            "updated": "2026-08-14",
            "baseline": {"manifest": "01-baseline-manifest.json"},
            "artifacts": [
                {"artifact_id": "prd-current", "type": "prd", "path_or_remote_id": "05-prd/current.md", "authoritative_source": "local-primary", "version_or_hash": sha256_file(project / "05-prd/current.md"), "producer_capability": "prd", "dependencies": ["scope.assisted-scoring"], "owner": "shared", "status": "current", "last_verified_at": "2026-08-14T00:00:00+08:00"},
                {"artifact_id": "prototype-current", "type": "prototype", "path_or_remote_id": "06-prototype/index.html", "authoritative_source": "local-primary", "version_or_hash": sha256_file(project / "06-prototype/index.html"), "producer_capability": "prototype", "dependencies": ["scope.assisted-scoring"], "owner": "ai", "status": "current", "last_verified_at": "2026-08-14T00:00:00+08:00"},
                {"artifact_id": "review-current", "type": "review", "path_or_remote_id": "08-reviews/current.md", "authoritative_source": "local-primary", "version_or_hash": "0000000000000000000000000000000000000000000000000000000000000000", "producer_capability": "review", "dependencies": [], "owner": "shared", "status": "current", "last_verified_at": "2026-08-14T00:00:00+08:00"},
            ],
        }, ensure_ascii=False), encoding="utf-8")
        (project / "01-baseline-manifest.json").write_text(json.dumps({
            "schema_version": 1,
            "project": "示例项目",
            "project_type": "iteration",
            "generated_at": "2026-08-14T00:00:00+08:00",
            "sources": [{"source_id": "user.current", "kind": "user-decision", "path_or_remote_id": "conversation:current", "observed_at": "2026-08-14", "authority": "confirmed"}],
            "claims": [{"claim_id": "scope.assisted-scoring", "kind": "decision", "statement": "删除 AI 辅助评分", "risk": "high", "state": "removed", "source_ids": ["user.current"], "aliases": ["AI 辅助评分"], "applies_to": ["prd-current", "prototype-current"]}],
            "open_questions": [],
        }, ensure_ascii=False), encoding="utf-8")
        before = {p.relative_to(project).as_posix(): p.read_bytes() for p in project.rglob("*") if p.is_file()}
        report = reconcile(project)
        after = {p.relative_to(project).as_posix(): p.read_bytes() for p in project.rglob("*") if p.is_file()}
        assert before == after, "reconcile preview 不得修改项目"
        states = {r.get("artifact_id"): r["state"] for r in report["results"]}
        assert states["prd-current"] == "aligned", states
        assert states["prototype-current"] == "stale", states
        assert states["review-current"] == "pending-decision", states
    print("aipm_reconcile selftest: OK（只读 + 删除范围残留阳性/阴性 + 本地编辑感知）")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--strict", action="store_true", help="发现 stale/conflict/pending/coverage gap 时退出 1")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.project:
        parser.error("--project is required unless --selftest is used")
    try:
        report = reconcile(resolve_project(args.project))
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        sys.stdout.write(render_human(report))
    has_issues = any(item["state"] in ISSUE_STATES for item in report["results"])
    return 1 if args.strict and has_issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
