#!/usr/bin/env python3
"""Create, validate and render AI_PM delivery impact records."""

from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path
from typing import Any

from aipm_core import (
    ID_RE,
    atomic_write_json,
    load_json,
    resolve_project,
    sha256_file,
    validate_status_artifacts,
)


DECISIONS = {"pending", "continue", "adjust", "stop", "observe"}
FINAL_DECISIONS = {"continue", "adjust", "stop"}
METRIC_KINDS = {"rate", "count", "duration", "score"}


def validate_record(data: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if data.get("schema_version") != 1:
        errors.append("schema_version 必须为 1")
    if not str(data.get("project", "")).strip():
        errors.append("project 必须是非空字符串")
    objective = data.get("objective")
    if not isinstance(objective, dict) or not str(objective.get("statement", "")).strip():
        errors.append("objective.statement 必须填写")
    release = data.get("release_anchor")
    if not isinstance(release, dict):
        errors.append("release_anchor 必须是 object")
        release = {}
    metrics = data.get("metrics")
    if not isinstance(metrics, list):
        errors.append("metrics 必须是数组")
        metrics = []
    qualitative = data.get("qualitative_evidence")
    if not isinstance(qualitative, list):
        errors.append("qualitative_evidence 必须是数组")
        qualitative = []
    fact_updates = data.get("fact_updates")
    if not isinstance(fact_updates, list):
        errors.append("fact_updates 必须是数组")
        fact_updates = []

    metric_ids: set[str] = set()
    usable_metric_evidence = 0
    for index, metric in enumerate(metrics):
        prefix = f"metrics[{index}]"
        if not isinstance(metric, dict):
            errors.append(f"{prefix} 必须是 object")
            continue
        metric_id = str(metric.get("metric_id", ""))
        if not ID_RE.match(metric_id):
            errors.append(f"{prefix}.metric_id 非法: {metric_id}")
        if metric_id in metric_ids:
            errors.append(f"metric_id 重复: {metric_id}")
        metric_ids.add(metric_id)
        for field in ("name", "definition", "version"):
            if not str(metric.get(field, "")).strip():
                errors.append(f"{prefix}.{field} 必须填写")
        if metric.get("kind") not in METRIC_KINDS:
            errors.append(f"{prefix}.kind 非法: {metric.get('kind')}")
        if metric.get("kind") == "rate":
            if not str(metric.get("numerator", "")).strip() or not str(metric.get("denominator", "")).strip():
                errors.append(f"{prefix} rate 指标必须写 numerator 和 denominator")
        baseline = metric.get("baseline")
        observations = metric.get("observations")
        if baseline is not None:
            if not isinstance(baseline, dict) or not all(str(baseline.get(k, "")).strip() for k in ("value", "observed_at", "source")):
                errors.append(f"{prefix}.baseline 必须含 value/observed_at/source，或为 null")
        if not isinstance(observations, list):
            errors.append(f"{prefix}.observations 必须是数组")
            observations = []
        for obs_index, observation in enumerate(observations):
            if not isinstance(observation, dict) or not all(str(observation.get(k, "")).strip() for k in ("value", "observed_at", "source")):
                errors.append(f"{prefix}.observations[{obs_index}] 必须含 value/observed_at/source")
        if baseline is not None and observations:
            usable_metric_evidence += 1

    evidence_ids: set[str] = set()
    for index, evidence in enumerate(qualitative):
        prefix = f"qualitative_evidence[{index}]"
        if not isinstance(evidence, dict):
            errors.append(f"{prefix} 必须是 object")
            continue
        evidence_id = str(evidence.get("evidence_id", ""))
        if not ID_RE.match(evidence_id):
            errors.append(f"{prefix}.evidence_id 非法: {evidence_id}")
        if evidence_id in evidence_ids:
            errors.append(f"evidence_id 重复: {evidence_id}")
        evidence_ids.add(evidence_id)
        for field in ("kind", "observed_at", "source", "summary"):
            if not str(evidence.get(field, "")).strip():
                errors.append(f"{prefix}.{field} 必须填写")

    conclusion = data.get("conclusion")
    if not isinstance(conclusion, dict):
        errors.append("conclusion 必须是 object")
        conclusion = {}
    decision = conclusion.get("decision")
    if decision not in DECISIONS:
        errors.append(f"conclusion.decision 非法: {decision}")
    rationale = str(conclusion.get("rationale", "")).strip()
    refs = conclusion.get("evidence_ids")
    if not isinstance(refs, list):
        errors.append("conclusion.evidence_ids 必须是数组")
        refs = []
    unknown_refs = sorted(set(str(x) for x in refs) - evidence_ids - metric_ids)
    if unknown_refs:
        errors.append(f"conclusion 引用未知 evidence/metric id: {unknown_refs}")
    if decision in FINAL_DECISIONS:
        if not release.get("released_at") or not release.get("evidence"):
            errors.append(f"decision={decision} 时必须有发布锚点和证据")
        if usable_metric_evidence == 0 and not qualitative:
            errors.append(f"decision={decision} 时没有基线+观察或定性证据")
        if not rationale or not refs:
            errors.append(f"decision={decision} 时必须给 rationale 和 evidence_ids")
    elif decision == "observe" and not rationale:
        errors.append("decision=observe 时必须说明还缺什么证据")
    elif decision == "pending":
        warnings.append("结论仍为 pending，不能回写项目事实")
    known_evidence = evidence_ids | metric_ids
    for index, update in enumerate(fact_updates):
        prefix = f"fact_updates[{index}]"
        if not isinstance(update, dict):
            errors.append(f"{prefix} 必须是 object")
            continue
        if update.get("target") not in {"baseline", "memory"}:
            errors.append(f"{prefix}.target 非法: {update.get('target')}")
        if not str(update.get("statement", "")).strip():
            errors.append(f"{prefix}.statement 必须填写")
        update_refs = update.get("evidence_ids")
        if not isinstance(update_refs, list) or not update_refs:
            errors.append(f"{prefix}.evidence_ids 必须是非空数组")
        else:
            unknown_update_refs = sorted(set(str(x) for x in update_refs) - known_evidence)
            if unknown_update_refs:
                errors.append(f"{prefix} 引用未知 evidence/metric id: {unknown_update_refs}")
    return errors, warnings


def new_record(project: Path, objective: str, released_at: str, release_evidence: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "project": load_json(project / "_status.json").get("project") or project.name,
        "created_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "objective": {"statement": objective, "source_ids": []},
        "release_anchor": {"released_at": released_at, "evidence": release_evidence},
        "metrics": [],
        "qualitative_evidence": [],
        "conclusion": {"decision": "pending", "rationale": "", "evidence_ids": []},
        "fact_updates": [],
    }


def artifact_registration_context(
    project: Path, path: Path, artifact_id: str
) -> tuple[Path, str, dict[str, Any]]:
    project = project.resolve()
    path = path.resolve()
    try:
        ref = path.relative_to(project).as_posix()
    except ValueError as exc:
        raise ValueError(f"impact 产物必须位于项目目录内: {path}") from exc
    status_path = project / "_status.json"
    status = load_json(status_path)
    errors, _ = validate_status_artifacts(status, project)
    if errors:
        raise ValueError("项目产物契约已有错误，拒绝追加登记: " + "；".join(errors))
    artifacts = status.setdefault("artifacts", [])
    conflicts = [
        item for item in artifacts
        if isinstance(item, dict)
        and (item.get("artifact_id") == artifact_id or item.get("path_or_remote_id") == ref)
    ]
    if conflicts:
        raise ValueError(f"impact artifact 已登记，拒绝覆盖: {artifact_id} / {ref}")
    return status_path, ref, status


def register_artifact(project: Path, path: Path, artifact_id: str) -> None:
    status_path, ref, status = artifact_registration_context(project, path, artifact_id)
    artifacts = status.setdefault("artifacts", [])
    now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    artifacts.append({
        "artifact_id": artifact_id,
        "type": "metric",
        "path_or_remote_id": ref,
        "authoritative_source": "local-primary",
        "version_or_hash": sha256_file(path),
        "producer_capability": "impact",
        "dependencies": [],
        "owner": "shared",
        "status": "current",
        "last_verified_at": now,
    })
    status["updated"] = datetime.date.today().isoformat()
    atomic_write_json(status_path, status)


def render_markdown(data: dict[str, Any]) -> str:
    release = data.get("release_anchor", {})
    conclusion = data.get("conclusion", {})
    lines = [
        f"# 效果回收 · {data.get('project', '')}",
        "",
        f"- 目标：{data.get('objective', {}).get('statement', '')}",
        f"- 发布锚点：{release.get('released_at') or '未提供'}",
        f"- 发布证据：{release.get('evidence') or '未提供'}",
        "",
        "## 指标证据",
        "",
        "| 指标 | 口径版本 | 基线 | 观察 | 来源 |",
        "|---|---|---|---|---|",
    ]
    for metric in data.get("metrics", []):
        baseline = metric.get("baseline") or {}
        observations = metric.get("observations") or []
        observation = observations[-1] if observations else {}
        sources = " / ".join(filter(None, [str(baseline.get("source", "")), str(observation.get("source", ""))])) or "—"
        lines.append(
            f"| {metric.get('name', '')} | {metric.get('version', '')} | "
            f"{baseline.get('value', '—')} | {observation.get('value', '—')} | {sources} |"
        )
    if not data.get("metrics"):
        lines.append("| — | — | — | — | 暂无指标证据 |")
    lines.extend(["", "## 定性证据", ""])
    if data.get("qualitative_evidence"):
        for item in data["qualitative_evidence"]:
            lines.append(f"- `{item.get('evidence_id')}` {item.get('summary')}（{item.get('source')}）")
    else:
        lines.append("- 暂无。")
    lines.extend([
        "",
        "## 结论",
        "",
        f"- 决策：`{conclusion.get('decision', 'pending')}`",
        f"- 理由：{conclusion.get('rationale') or '证据不足，尚未形成结论'}",
        f"- 证据：{', '.join(conclusion.get('evidence_ids') or []) or '—'}",
        "",
        "## 待更新事实",
        "",
    ])
    if data.get("fact_updates"):
        for item in data["fact_updates"]:
            lines.append(
                f"- [{item.get('target')}] {item.get('statement')}"
                f"（证据：{', '.join(item.get('evidence_ids') or [])}）"
            )
    else:
        lines.append("- 无；只有用户确认结论后才回写 baseline/memory。")
    return "\n".join(lines) + "\n"


def _print_validation(errors: list[str], warnings: list[str]) -> int:
    for item in warnings:
        print(f"WARN: {item}")
    for item in errors:
        print(f"ERROR: {item}")
    if not errors:
        print(f"PASS: impact record（warning={len(warnings)}）")
    return 1 if errors else 0


def selftest() -> int:
    base = {
        "schema_version": 1,
        "project": "示例项目",
        "objective": {"statement": "减少重复操作"},
        "release_anchor": {},
        "metrics": [],
        "qualitative_evidence": [],
        "conclusion": {"decision": "observe", "rationale": "尚无发布基线，继续观察", "evidence_ids": []},
        "fact_updates": [],
    }
    assert validate_record(base) == ([], []), validate_record(base)
    forced = json.loads(json.dumps(base, ensure_ascii=False))
    forced["conclusion"] = {"decision": "continue", "rationale": "感觉不错", "evidence_ids": []}
    errors, _ = validate_record(forced)
    assert any("发布锚点" in item for item in errors), errors
    assert any("没有基线" in item for item in errors), errors
    good = json.loads(json.dumps(base, ensure_ascii=False))
    good["release_anchor"] = {"released_at": "2026-08-01", "evidence": "release:123"}
    good["metrics"] = [{
        "metric_id": "activation-rate", "name": "激活率", "kind": "rate",
        "definition": "完成核心动作的目标用户占比", "numerator": "完成核心动作的目标用户数",
        "denominator": "进入目标流程的目标用户数", "version": "2026-08",
        "baseline": {"value": "20%", "observed_at": "2026-07-01", "source": "manual:baseline"},
        "observations": [{"value": "28%", "observed_at": "2026-08-10", "source": "manual:observation"}],
    }]
    good["conclusion"] = {"decision": "continue", "rationale": "核心指标改善，口径未变", "evidence_ids": ["activation-rate"]}
    assert validate_record(good) == ([], []), validate_record(good)
    assert "决策：`continue`" in render_markdown(good)
    print("aipm_impact selftest: OK（证据不足合法 + 无证据禁止强结论）")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("selftest")
    init = sub.add_parser("init")
    init.add_argument("--project", required=True)
    init.add_argument("--objective", required=True)
    init.add_argument("--released-at", default="")
    init.add_argument("--release-evidence", default="")
    init.add_argument("--write", action="store_true")
    validate = sub.add_parser("validate")
    validate.add_argument("--record", required=True)
    render = sub.add_parser("render")
    render.add_argument("--record", required=True)
    render.add_argument("--out")
    args = parser.parse_args()
    try:
        if args.command == "selftest":
            return selftest()
        if args.command == "init":
            project = resolve_project(args.project)
            record = new_record(project, args.objective, args.released_at, args.release_evidence)
            if not args.write:
                print(json.dumps(record, ensure_ascii=False, indent=2))
                print("PREVIEW: 未写入；确认后追加 --write", file=sys.stderr)
                return 0
            out = project / "09-analytics" / "impact-record.json"
            if out.exists():
                raise ValueError(f"impact record 已存在，拒绝覆盖: {out}")
            artifact_registration_context(project, out, "impact.record")
            atomic_write_json(out, record)
            try:
                register_artifact(project, out, "impact.record")
            except (OSError, ValueError):
                out.unlink(missing_ok=True)
                raise
            print(f"APPLIED: {out}")
            return 0
        record = load_json(Path(args.record).expanduser().resolve())
        errors, warnings = validate_record(record)
        if args.command == "validate":
            return _print_validation(errors, warnings)
        if errors:
            return _print_validation(errors, warnings)
        content = render_markdown(record)
        if args.out:
            out = Path(args.out).expanduser().resolve()
            if out.exists():
                raise ValueError(f"输出已存在，拒绝覆盖: {out}")
            candidate_project = Path(args.record).expanduser().resolve().parent.parent
            register_report = (candidate_project / "_status.json").is_file()
            if register_report:
                artifact_registration_context(candidate_project, out, "impact.report")
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(content, encoding="utf-8")
            if register_report:
                try:
                    register_artifact(candidate_project, out, "impact.report")
                except (OSError, ValueError):
                    out.unlink(missing_ok=True)
                    raise
            print(f"APPLIED: {out}")
        else:
            sys.stdout.write(content)
        return 0
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
