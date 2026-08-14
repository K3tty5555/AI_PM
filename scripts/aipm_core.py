#!/usr/bin/env python3
"""Shared contracts for AI_PM baseline, artifact and capability tooling."""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parent.parent
CAPABILITY_REGISTRY = ROOT / "templates" / "configs" / "capability-registry.json"
SKILLS_DIR = ROOT / ".claude" / "skills"

MODE_IDS = {"explore", "decide", "prd", "prototype", "review", "operate"}
PROJECT_TYPES = {"zero-to-one", "iteration", "import"}
CLAIM_KINDS = {"current-fact", "target", "decision", "assumption"}
CLAIM_STATES = {"active", "removed", "changed", "unknown"}
RISKS = {"high", "medium", "low"}
AUTHORITIES = {"local-primary", "cloud-primary", "mixed", "external-reference"}
ARTIFACT_TYPES = {
    "baseline", "decision", "prd", "prototype", "review", "acceptance",
    "metric", "release-doc", "cloud-doc", "memory", "other",
}
ARTIFACT_OWNERS = {"ai", "human", "shared", "external"}
ARTIFACT_STATUSES = {"current", "stale", "archived", "missing"}
SIDE_EFFECTS = {"read-project", "write-local", "network-read", "write-cloud", "external-write"}
LOCAL_TEXT_SUFFIXES = {".md", ".html", ".htm", ".txt", ".json", ".csv"}
ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"文件不存在: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON 解析失败: {path}:{exc.lineno}: {exc.msg}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"顶层必须是 object: {path}")
    return data


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_project(value: str | Path) -> Path:
    project = Path(value).expanduser().resolve()
    if not project.is_dir():
        raise ValueError(f"项目目录不存在: {project}")
    return project


def is_remote_ref(value: str) -> bool:
    return bool(re.match(r"^(?:https?://|[a-z]+:)", value, re.I))


def resolve_artifact_path(project: Path, ref: str) -> Path | None:
    if is_remote_ref(ref):
        return None
    candidate = (project / ref).resolve()
    try:
        candidate.relative_to(project.resolve())
    except ValueError as exc:
        raise ValueError(f"产物路径越出项目目录: {ref}") from exc
    return candidate


def _require_string(obj: dict[str, Any], key: str, prefix: str, errors: list[str]) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{prefix}.{key} 必须是非空字符串")
        return ""
    return value.strip()


def _duplicates(values: Iterable[str]) -> set[str]:
    seen: set[str] = set()
    dup: set[str] = set()
    for value in values:
        if value in seen:
            dup.add(value)
        seen.add(value)
    return dup


def validate_capability_registry(
    data: dict[str, Any], skills_dir: Path = SKILLS_DIR
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if data.get("schema_version") != 1:
        errors.append("capability registry schema_version 必须为 1")
    modes = data.get("modes")
    capabilities = data.get("capabilities")
    if not isinstance(modes, list):
        errors.append("modes 必须是数组")
        modes = []
    if not isinstance(capabilities, list):
        errors.append("capabilities 必须是数组")
        capabilities = []

    mode_ids = [m.get("id") for m in modes if isinstance(m, dict)]
    if set(mode_ids) != MODE_IDS:
        errors.append(f"六模式必须且只能是 {sorted(MODE_IDS)}，实际 {sorted(str(x) for x in mode_ids)}")
    if dup := _duplicates(str(x) for x in mode_ids):
        errors.append(f"mode id 重复: {sorted(dup)}")

    cap_ids = [c.get("id") for c in capabilities if isinstance(c, dict)]
    if dup := _duplicates(str(x) for x in cap_ids):
        errors.append(f"capability id 重复: {sorted(dup)}")
    known_caps = set(cap_ids)
    used_caps: set[str] = set()
    for index, mode in enumerate(modes):
        if not isinstance(mode, dict):
            errors.append(f"modes[{index}] 必须是 object")
            continue
        refs = mode.get("capabilities")
        if not isinstance(refs, list):
            errors.append(f"mode {mode.get('id')} capabilities 必须是数组")
            continue
        used_caps.update(str(x) for x in refs)
        unknown = sorted(set(refs) - known_caps)
        if unknown:
            errors.append(f"mode {mode.get('id')} 引用未知 capability: {unknown}")

    valid_phase_effects = {"none", "routes", "delegates", "completes", "reads"}
    for index, cap in enumerate(capabilities):
        prefix = f"capabilities[{index}]"
        if not isinstance(cap, dict):
            errors.append(f"{prefix} 必须是 object")
            continue
        cap_id = _require_string(cap, "id", prefix, errors)
        skill = _require_string(cap, "skill", prefix, errors)
        availability = cap.get("availability", "required")
        if availability not in {"required", "optional-private"}:
            errors.append(f"{prefix}.availability 非法: {availability}")
        cap_modes = cap.get("modes")
        if not isinstance(cap_modes, list):
            errors.append(f"{prefix}.modes 必须是数组")
        else:
            unknown_modes = sorted(set(cap_modes) - MODE_IDS)
            if unknown_modes:
                errors.append(f"{prefix}.modes 有未知模式: {unknown_modes}")
        effect = cap.get("phase_effect")
        if not isinstance(effect, dict) or effect.get("kind") not in valid_phase_effects:
            errors.append(f"{prefix}.phase_effect.kind 非法")
        elif effect.get("kind") == "completes" and not effect.get("phase"):
            errors.append(f"{prefix}.phase_effect completes 时必须声明 phase")
        if skill and not (skills_dir / skill / "SKILL.md").is_file():
            message = f"{prefix}.skill 不存在: {skill}"
            if availability == "optional-private":
                warnings.append(f"可选私有适配器未安装: {skill}")
            else:
                errors.append(message)
        if not isinstance(cap.get("artifacts"), list):
            errors.append(f"{prefix}.artifacts 必须是数组")
        if not isinstance(cap.get("side_effects"), list):
            errors.append(f"{prefix}.side_effects 必须是数组")
        else:
            unknown_effects = sorted(set(cap["side_effects"]) - SIDE_EFFECTS)
            if unknown_effects:
                errors.append(f"{prefix}.side_effects 非法: {unknown_effects}")
        if cap_id and cap_modes and cap_id not in used_caps:
            warnings.append(f"capability {cap_id} 声明模式但未被 mode.capabilities 引用")

    mode_membership = {
        str(mode.get("id")): set(str(item) for item in mode.get("capabilities", []))
        for mode in modes if isinstance(mode, dict) and isinstance(mode.get("capabilities"), list)
    }
    for index, cap in enumerate(capabilities):
        if not isinstance(cap, dict) or not isinstance(cap.get("modes"), list):
            continue
        cap_id = str(cap.get("id", ""))
        listed_by = {mode_id for mode_id, refs in mode_membership.items() if cap_id in refs}
        declared = set(str(item) for item in cap["modes"])
        if listed_by != declared:
            errors.append(
                f"capabilities[{index}] mode 双向映射不一致: declared={sorted(declared)} listed={sorted(listed_by)}"
            )

    registered_skills = {c.get("skill") for c in capabilities if isinstance(c, dict)}
    disk_skills = {p.parent.name for p in skills_dir.glob("*/SKILL.md")}
    missing_registration = sorted(disk_skills - registered_skills)
    if missing_registration:
        warnings.append(f"磁盘 skill 尚未登记: {missing_registration}")
    return errors, warnings


def validate_baseline(data: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if data.get("schema_version") != 1:
        errors.append("baseline.schema_version 必须为 1")
    _require_string(data, "project", "baseline", errors)
    if data.get("project_type") not in PROJECT_TYPES:
        errors.append(f"baseline.project_type 非法: {data.get('project_type')}")
    _require_string(data, "generated_at", "baseline", errors)
    sources = data.get("sources")
    claims = data.get("claims")
    questions = data.get("open_questions")
    if not isinstance(sources, list):
        errors.append("baseline.sources 必须是数组")
        sources = []
    if not isinstance(claims, list):
        errors.append("baseline.claims 必须是数组")
        claims = []
    if not isinstance(questions, list):
        errors.append("baseline.open_questions 必须是数组")
        questions = []
    if data.get("project_type") in {"iteration", "import"} and not claims:
        errors.append(f"{data.get('project_type')} 项目 claims 为空，不能作为可用基线")

    source_ids: list[str] = []
    for index, source in enumerate(sources):
        prefix = f"sources[{index}]"
        if not isinstance(source, dict):
            errors.append(f"{prefix} 必须是 object")
            continue
        source_id = _require_string(source, "source_id", prefix, errors)
        if source_id and not ID_RE.match(source_id):
            errors.append(f"{prefix}.source_id 非法: {source_id}")
        source_ids.append(source_id)
        if source.get("kind") not in {
            "user-decision", "current-product", "project-document", "data",
            "external-evidence", "historical",
        }:
            errors.append(f"{prefix}.kind 非法: {source.get('kind')}")
        _require_string(source, "path_or_remote_id", prefix, errors)
        _require_string(source, "observed_at", prefix, errors)
        if source.get("authority") not in {"confirmed", "candidate", "reference"}:
            errors.append(f"{prefix}.authority 非法: {source.get('authority')}")
    if dup := _duplicates(x for x in source_ids if x):
        errors.append(f"source_id 重复: {sorted(dup)}")
    known_sources = set(source_ids)

    claim_ids: list[str] = []
    for index, claim in enumerate(claims):
        prefix = f"claims[{index}]"
        if not isinstance(claim, dict):
            errors.append(f"{prefix} 必须是 object")
            continue
        claim_id = _require_string(claim, "claim_id", prefix, errors)
        if claim_id and not ID_RE.match(claim_id):
            errors.append(f"{prefix}.claim_id 非法: {claim_id}")
        claim_ids.append(claim_id)
        if claim.get("kind") not in CLAIM_KINDS:
            errors.append(f"{prefix}.kind 非法: {claim.get('kind')}")
        _require_string(claim, "statement", prefix, errors)
        if claim.get("risk") not in RISKS:
            errors.append(f"{prefix}.risk 非法: {claim.get('risk')}")
        if claim.get("state") not in CLAIM_STATES:
            errors.append(f"{prefix}.state 非法: {claim.get('state')}")
        refs = claim.get("source_ids")
        aliases = claim.get("aliases")
        if not isinstance(refs, list):
            errors.append(f"{prefix}.source_ids 必须是数组")
            refs = []
        if not isinstance(aliases, list):
            errors.append(f"{prefix}.aliases 必须是数组")
            aliases = []
        unknown_refs = sorted(set(str(x) for x in refs) - known_sources)
        if unknown_refs:
            errors.append(f"{prefix} 引用未知 source_id: {unknown_refs}")
        if claim.get("risk") == "high" and not refs:
            errors.append(f"{prefix} 高风险 claim 无来源，必须阻断")
        elif claim.get("risk") == "medium" and not refs:
            warnings.append(f"{prefix} 中风险 claim 无来源")
        if claim.get("state") in {"removed", "changed"} and not any(str(x).strip() for x in aliases):
            message = f"{prefix} 为 {claim.get('state')} 但 aliases 为空，残留扫描召回率会降低"
            if claim.get("risk") == "high":
                errors.append(message)
            else:
                warnings.append(message)
    if dup := _duplicates(x for x in claim_ids if x):
        errors.append(f"claim_id 重复: {sorted(dup)}")

    for index, question in enumerate(questions):
        prefix = f"open_questions[{index}]"
        if not isinstance(question, dict):
            errors.append(f"{prefix} 必须是 object")
            continue
        _require_string(question, "question_id", prefix, errors)
        _require_string(question, "text", prefix, errors)
        if question.get("risk") not in RISKS:
            errors.append(f"{prefix}.risk 非法: {question.get('risk')}")
        if question.get("risk") == "high":
            warnings.append(f"{prefix} 是高风险未决问题")
    return errors, warnings


def validate_status_artifacts(data: dict[str, Any], project: Path | None = None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    artifacts = data.get("artifacts", [])
    if not isinstance(artifacts, list):
        return ["status.artifacts 必须是数组"], warnings
    artifact_ids: list[str] = []
    for index, artifact in enumerate(artifacts):
        prefix = f"artifacts[{index}]"
        if not isinstance(artifact, dict):
            errors.append(f"{prefix} 必须是 object")
            continue
        artifact_id = _require_string(artifact, "artifact_id", prefix, errors)
        artifact_ids.append(artifact_id)
        if artifact_id and not ID_RE.match(artifact_id):
            errors.append(f"{prefix}.artifact_id 非法: {artifact_id}")
        if artifact.get("type") not in ARTIFACT_TYPES:
            errors.append(f"{prefix}.type 非法: {artifact.get('type')}")
        ref = _require_string(artifact, "path_or_remote_id", prefix, errors)
        if artifact.get("authoritative_source") not in AUTHORITIES:
            errors.append(f"{prefix}.authoritative_source 非法: {artifact.get('authoritative_source')}")
        _require_string(artifact, "version_or_hash", prefix, errors)
        _require_string(artifact, "producer_capability", prefix, errors)
        deps = artifact.get("dependencies")
        if not isinstance(deps, list):
            errors.append(f"{prefix}.dependencies 必须是数组")
        if artifact.get("owner") not in ARTIFACT_OWNERS:
            errors.append(f"{prefix}.owner 非法: {artifact.get('owner')}")
        if artifact.get("status") not in ARTIFACT_STATUSES:
            errors.append(f"{prefix}.status 非法: {artifact.get('status')}")
        _require_string(artifact, "last_verified_at", prefix, errors)
        rules = artifact.get("ownership_rules")
        if rules is not None and not isinstance(rules, list):
            errors.append(f"{prefix}.ownership_rules 必须是数组")
            rules = []
        for rule_index, rule in enumerate(rules or []):
            rule_prefix = f"{prefix}.ownership_rules[{rule_index}]"
            if not isinstance(rule, dict):
                errors.append(f"{rule_prefix} 必须是 object")
                continue
            _require_string(rule, "selector", rule_prefix, errors)
            if rule.get("owner") not in {"ai", "human", "shared"}:
                errors.append(f"{rule_prefix}.owner 非法: {rule.get('owner')}")
            if rule.get("conflict_policy") not in {"block", "prefer-local", "prefer-cloud", "manual"}:
                errors.append(
                    f"{rule_prefix}.conflict_policy 非法: {rule.get('conflict_policy')}"
                )
        if artifact.get("authoritative_source") == "mixed" and not rules:
            warnings.append(f"{prefix} 为 mixed 但 ownership_rules 为空；写操作必须阻断")
        if project is not None and ref:
            try:
                local_path = resolve_artifact_path(project, ref)
            except ValueError as exc:
                errors.append(str(exc))
                continue
            if local_path is not None and not local_path.exists() and artifact.get("status") == "current":
                warnings.append(f"{prefix} 登记为 current 但文件不存在: {ref}")
    if dup := _duplicates(x for x in artifact_ids if x):
        errors.append(f"artifact_id 重复: {sorted(dup)}")

    baseline = data.get("baseline")
    if baseline is not None:
        if not isinstance(baseline, dict):
            errors.append("status.baseline 必须是 object")
        elif baseline.get("manifest") != "01-baseline-manifest.json":
            errors.append("status.baseline.manifest 必须是 01-baseline-manifest.json")
        elif project is not None and not (project / "01-baseline-manifest.json").is_file():
            warnings.append("status 已登记 baseline，但 01-baseline-manifest.json 不存在")
    return errors, warnings


def discover_reconcilable_artifacts(project: Path) -> list[str]:
    patterns = [
        "05-prd/**/*.md",
        "06-prototype/**/*.html",
        "08-reviews/**/*.md",
        "09-analytics/**/*.md",
        "09-analytics/**/*.json",
        "13-release-docs/**/*.md",
        "14-acceptance/**/*.md",
        "14-acceptance/**/*.json",
        "14-acceptance/**/*.csv",
    ]
    found: set[str] = set()
    for pattern in patterns:
        for path in project.glob(pattern):
            if path.is_file() and path.name.lower() != "readme.md":
                found.add(path.relative_to(project).as_posix())
    return sorted(found)


def registered_local_paths(project: Path, status: dict[str, Any]) -> set[str]:
    project = project.resolve()
    paths: set[str] = set()
    for artifact in status.get("artifacts", []):
        if not isinstance(artifact, dict):
            continue
        ref = artifact.get("path_or_remote_id")
        if not isinstance(ref, str) or is_remote_ref(ref):
            continue
        try:
            path = resolve_artifact_path(project, ref)
        except ValueError:
            continue
        if path is not None:
            paths.add(path.relative_to(project).as_posix())
    return paths


def claim_terms(claim: dict[str, Any]) -> list[str]:
    terms: list[str] = []
    for value in claim.get("aliases", []):
        text = str(value).strip()
        if len(text) >= 2 and text not in terms:
            terms.append(text)
    return terms


def read_searchable_text(path: Path) -> str | None:
    if path.suffix.lower() not in LOCAL_TEXT_SUFFIXES:
        return None
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
