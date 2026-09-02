#!/usr/bin/env python3
"""校验和检索本地业务知识视图。

默认只返回 source_of_truth=true 的卡片。草稿必须显式加 --include-drafts，
避免未经人工评审的蒸馏内容进入 PRD 推荐。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import datetime as dt
from pathlib import Path


REQUIRED_FIELDS = (
    "id",
    "doc_type",
    "domain",
    "status",
    "confidence",
    "source_of_truth",
    "last_verified",
)

BUSINESS_TERMS = (
    "作业", "考试", "多张", "跨页", "补扫", "扫描", "匹配", "批改", "报告", "留痕",
    "题库", "题卡", "题源", "组卷", "搜题", "权限", "套餐", "班级", "任课", "发布",
    "删除", "重试", "异常", "学情", "知识体系", "Agent", "AI",
)


def parse_frontmatter(text: str) -> dict[str, object]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---\n", 4)
    if end < 0:
        return {}
    data: dict[str, object] = {}
    for raw_line in text[4:end].splitlines():
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        value = value.strip()
        if value == "true":
            parsed: object = True
        elif value == "false":
            parsed = False
        else:
            parsed = value
        data[key.strip()] = parsed
    return data


def title_of(text: str) -> str:
    match = re.search(r"^#\s+(.+)$", text, re.M)
    return match.group(1).strip() if match else ""


def load_manifest(root: Path) -> dict:
    path = root / "manifest.json"
    if not path.is_file():
        raise ValueError(f"缺少 manifest: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise ValueError("manifest.json 必须是对象且包含 items 数组")
    return data


def load_entries(root: Path) -> tuple[dict, list[dict], list[str]]:
    manifest = load_manifest(root)
    entries: list[dict] = []
    errors: list[str] = []
    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    for index, item in enumerate(manifest["items"]):
        if not isinstance(item, dict):
            errors.append(f"items[{index}] 不是对象")
            continue
        item_id = str(item.get("id") or "")
        rel = str(item.get("path") or "")
        if not item_id or not rel:
            errors.append(f"items[{index}] 缺 id/path")
            continue
        if item_id in seen_ids:
            errors.append(f"重复 id: {item_id}")
        if rel in seen_paths:
            errors.append(f"重复 path: {rel}")
        seen_ids.add(item_id)
        seen_paths.add(rel)
        path = root / rel
        if not path.is_file():
            errors.append(f"缺少文件: {rel}")
            continue
        text = path.read_text(encoding="utf-8")
        meta = parse_frontmatter(text)
        missing = [field for field in REQUIRED_FIELDS if field not in meta]
        if missing:
            errors.append(f"{rel} 缺字段: {', '.join(missing)}")
        if meta.get("id") != item_id:
            errors.append(f"{rel} id 不一致: manifest={item_id}, file={meta.get('id')}")
        if meta.get("doc_type") not in {"map", "rule", "process"}:
            errors.append(f"{rel} doc_type 非法: {meta.get('doc_type')}")
        if meta.get("status") not in {"draft", "confirmed", "superseded", "archived"}:
            errors.append(f"{rel} status 非法: {meta.get('status')}")
        if meta.get("confidence") not in {"low", "medium", "high"}:
            errors.append(f"{rel} confidence 非法: {meta.get('confidence')}")
        if not isinstance(meta.get("source_of_truth"), bool):
            errors.append(f"{rel} source_of_truth 必须为 true/false")
        if not title_of(text):
            errors.append(f"{rel} 缺少 H1 标题")
        entries.append({"path": rel, "file": path, "meta": meta, "title": title_of(text), "text": text})

    ids = {entry["meta"].get("id") for entry in entries}
    for entry in entries:
        for target in re.findall(r"`(L[12]-[A-Z0-9-]+)`", entry["text"]):
            if target not in ids:
                errors.append(f"{entry['path']} 引用未知卡片: {target}")

    actual_md = {
        path.relative_to(root).as_posix()
        for path in root.glob("l[12]/*.md")
    }
    extra = sorted(actual_md - seen_paths)
    if extra:
        errors.extend(f"未登记文件: {path}" for path in extra)
    return manifest, entries, errors


def discover_view_root() -> Path:
    """找到唯一业务知识视图；多个视图时拒绝猜测。"""
    configured = os.environ.get("AI_PM_BUSINESS_VIEW")
    if configured:
        return Path(configured)
    candidates = sorted(
        Path("output/assets").glob("*/derived/business-knowledge-view"),
        key=lambda path: path.as_posix(),
    )
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise ValueError("未找到业务知识视图，请用 --root 指定目录或设置 AI_PM_BUSINESS_VIEW")
    raise ValueError("发现多个业务知识视图，请用 --root 指定目标目录")


def command_validate(root: Path, quiet: bool = False) -> int:
    manifest, entries, errors = load_entries(root)
    l1 = sum(entry["path"].startswith("l1/") for entry in entries)
    l2 = sum(entry["path"].startswith("l2/") for entry in entries)
    if manifest.get("l1_count") != l1:
        errors.append(f"manifest l1_count={manifest.get('l1_count')}，实际={l1}")
    if manifest.get("l2_count") != l2:
        errors.append(f"manifest l2_count={manifest.get('l2_count')}，实际={l2}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    if not quiet:
        confirmed = sum(entry["meta"].get("source_of_truth") is True for entry in entries)
        print(f"PASS: business knowledge view valid · L1={l1} L2={l2} confirmed={confirmed}")
    return 0


def relevance(entry: dict, terms: list[str]) -> int:
    title = entry["title"].lower()
    domain = str(entry["meta"].get("domain") or "").lower()
    text = entry["text"].lower()
    score = 0
    for term in terms:
        term = term.lower()
        if term in title:
            score += 5
        if term in domain:
            score += 3
        score += min(text.count(term), 3)
    if entry["meta"].get("doc_type") == "rule":
        score += 1
    return score


def find_matches(entries: list[dict], terms: list[str], include_drafts: bool, limit: int) -> list[dict]:
    matches: list[tuple[int, dict]] = []
    for entry in entries:
        if not include_drafts and entry["meta"].get("source_of_truth") is not True:
            continue
        score = relevance(entry, terms)
        if score > 0:
            matches.append((score, entry))
    matches.sort(key=lambda pair: (-pair[0], pair[1]["title"]))
    return [
        {
            "id": entry["meta"].get("id"),
            "title": entry["title"],
            "domain": entry["meta"].get("domain"),
            "status": entry["meta"].get("status"),
            "confidence": entry["meta"].get("confidence"),
            "source_of_truth": entry["meta"].get("source_of_truth"),
            "path": entry["path"],
            "score": score,
        }
        for score, entry in matches[:limit]
    ]


def extract_terms(requirement: str, entries: list[dict], limit: int = 6) -> list[str]:
    """从需求文本中抽取与业务视图词表相交的确定性关键词。"""
    terms: set[str] = set()
    terms.update(term for term in BUSINESS_TERMS if term in requirement)
    for entry in entries:
        for source in (entry["title"], str(entry["meta"].get("domain") or "")):
            for token in re.split(r"[：:、，,。；;（）()\[\]【】/\\\s]+", source):
                token = token.strip()
                if 2 <= len(token) <= 4:
                    terms.add(token)
                elif len(token) > 4:
                    for width in (2, 3, 4):
                        terms.update(token[index:index + width] for index in range(len(token) - width + 1))
    scored = [(requirement.count(term), term) for term in terms if requirement.count(term) > 0]
    scored.sort(key=lambda pair: (-pair[0], -len(pair[1]), pair[1]))
    if scored:
        return [term for _, term in scored[:limit]]
    headings = [line.lstrip("#").strip() for line in requirement.splitlines() if line.startswith("#")]
    fallback = [term for term in re.split(r"[：:、，,。；;（）()\[\]【】/\\\s]+", " ".join(headings)) if len(term) >= 2]
    return fallback[:limit]


def command_search(root: Path, query: str, include_drafts: bool, limit: int, json_output: bool) -> int:
    _, entries, errors = load_entries(root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    terms = [term for term in re.split(r"\s+", query.strip()) if term]
    if not terms:
        print("查询词不能为空", file=sys.stderr)
        return 2
    rows = find_matches(entries, terms, include_drafts, limit)
    if json_output:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        for row in rows:
            state = "已确认" if row["source_of_truth"] else "草稿"
            print(f"[{row['id']}] {row['title']} · {row['domain']} · {state} · score={row['score']}")
            print(f"  {root / row['path']}")
    return 0


def command_recommend(root: Path, requirement_path: Path, include_drafts: bool, limit: int, json_output: bool) -> int:
    _, entries, errors = load_entries(root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    if not requirement_path.is_file():
        print(f"ERROR: requirement file not found: {requirement_path}", file=sys.stderr)
        return 2
    requirement = requirement_path.read_text(encoding="utf-8")
    terms = extract_terms(requirement, entries)
    rows = find_matches(entries, terms, include_drafts, limit) if terms else []
    result = {"requirement": str(requirement_path), "terms": terms, "matches": rows}
    if json_output:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"业务知识推荐关键词：{'、'.join(terms) if terms else '—'}")
        for row in rows:
            state = "已确认" if row["source_of_truth"] else "草稿"
            print(f"[{row['id']}] {row['title']} · {row['domain']} · {state}")
            print(f"  {root / row['path']}")
    return 0


def command_impact(root: Path, query: str, include_drafts: bool, limit: int, json_output: bool) -> int:
    _, entries, errors = load_entries(root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    terms = [term for term in re.split(r"\s+", query.strip()) if term]
    if not terms:
        print("影响查询词不能为空", file=sys.stderr)
        return 2
    # 影响检查只消费规则卡；L1 地图用于推荐，不应充当具体影响项。
    rule_entries = [entry for entry in entries if entry["meta"].get("doc_type") == "rule"]
    rows = find_matches(rule_entries, terms, include_drafts, limit)
    domains = []
    for row in rows:
        if row["domain"] not in domains:
            domains.append(row["domain"])
    result = {
        "query": query,
        "domains": domains,
        "matches": rows,
        "checklist": [
            "角色/权限是否受影响",
            "正常、异常、删除、重试路径是否完整",
            "统计、报告、留痕和学情下游是否同步",
            "历史存量场景是否兼容",
        ],
    }
    if json_output:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"潜在影响域：{'、'.join(domains) if domains else '—'}")
        for row in rows:
            print(f"[{row['id']}] {row['title']} · {row['domain']}")
        print("检查项：")
        for item in result["checklist"]:
            print(f"- {item}")
    return 0


def command_freshness(root: Path, max_age: int, json_output: bool) -> int:
    """检查业务知识视图和已确认卡片的本地保鲜状态，不访问云端。"""
    manifest, entries, errors = load_entries(root)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    today = dt.date.today()
    stale: list[dict] = []
    invalid_dates: list[str] = []
    for entry in entries:
        raw = str(entry["meta"].get("last_verified") or "")
        try:
            verified = dt.date.fromisoformat(raw)
        except ValueError:
            invalid_dates.append(entry["path"])
            continue
        age = (today - verified).days
        if age > max_age:
            stale.append({"id": entry["meta"].get("id"), "title": entry["title"], "path": entry["path"], "age_days": age})
    source_snapshot = root / str(manifest.get("source_snapshot") or "")
    source_exists = source_snapshot.is_file()
    generated_raw = str(manifest.get("generated_at") or "")
    try:
        generated = dt.date.fromisoformat(generated_raw)
        view_age = (today - generated).days
    except ValueError:
        generated = None
        view_age = None
    source_mtime = None
    source_newer_than_view = False
    if source_exists:
        source_mtime = dt.datetime.fromtimestamp(source_snapshot.stat().st_mtime, tz=dt.timezone.utc).isoformat()
        if generated is not None:
            source_newer_than_view = dt.datetime.fromtimestamp(source_snapshot.stat().st_mtime, tz=dt.timezone.utc).date() > generated
    result = {
        "status": "stale" if stale or invalid_dates or source_newer_than_view or (view_age is not None and view_age > max_age) else "fresh",
        "today": today.isoformat(),
        "max_age_days": max_age,
        "view_generated_at": generated_raw or None,
        "view_age_days": view_age,
        "source_snapshot": str(source_snapshot),
        "source_snapshot_exists": source_exists,
        "source_snapshot_mtime": source_mtime,
        "source_newer_than_view": source_newer_than_view,
        "confirmed_count": sum(entry["meta"].get("source_of_truth") is True for entry in entries),
        "stale_cards": stale,
        "invalid_last_verified": invalid_dates,
    }
    if json_output:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"业务知识视图：{result['status']} · 生成于 {generated_raw or '未知'} · {len(stale)} 张卡超龄")
        for card in stale:
            print(f"- [{card['id']}] {card['title']} · {card['age_days']} 天未核实")
        for path in invalid_dates:
            print(f"- 日期字段异常：{path}")
    return 1 if result["status"] == "stale" else 0


def selftest() -> int:
    sample = "---\nid: L2-X\nsource_of_truth: false\n---\n\n# 标题\n"
    meta = parse_frontmatter(sample)
    assert meta == {"id": "L2-X", "source_of_truth": False}
    assert title_of(sample) == "标题"
    entry = {"title": "权限取交集", "meta": {"domain": "权限与套餐", "doc_type": "rule"}, "text": sample + "权限"}
    assert relevance(entry, ["权限"]) >= 9
    assert "权限" in extract_terms("权限和报告", [entry])
    print("business-knowledge selftest: 4 passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="校验和检索本地业务知识视图")
    parser.add_argument(
        "--root",
        default=None,
        help="业务知识视图目录；不传时自动发现唯一视图",
    )
    parser.add_argument("--selftest", action="store_true")
    sub = parser.add_subparsers(dest="command")
    validate = sub.add_parser("validate")
    validate.add_argument("--quiet", action="store_true")
    search = sub.add_parser("search")
    search.add_argument("query")
    search.add_argument("--include-drafts", action="store_true")
    search.add_argument("--limit", type=int, default=5)
    search.add_argument("--json", action="store_true")
    recommend = sub.add_parser("recommend")
    recommend.add_argument("--requirement", required=True, type=Path)
    recommend.add_argument("--include-drafts", action="store_true")
    recommend.add_argument("--limit", type=int, default=5)
    recommend.add_argument("--json", action="store_true")
    impact = sub.add_parser("impact")
    impact.add_argument("query")
    impact.add_argument("--include-drafts", action="store_true")
    impact.add_argument("--limit", type=int, default=8)
    impact.add_argument("--json", action="store_true")
    freshness = sub.add_parser("freshness")
    freshness.add_argument("--max-age", type=int, default=90)
    freshness.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    try:
        root = Path(args.root) if args.root else discover_view_root()
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if args.command == "validate":
        return command_validate(root, args.quiet)
    if args.command == "search":
        return command_search(root, args.query, args.include_drafts, args.limit, args.json)
    if args.command == "recommend":
        return command_recommend(root, args.requirement, args.include_drafts, args.limit, args.json)
    if args.command == "impact":
        return command_impact(root, args.query, args.include_drafts, args.limit, args.json)
    if args.command == "freshness":
        return command_freshness(root, args.max_age, args.json)
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
