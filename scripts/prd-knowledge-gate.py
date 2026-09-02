#!/usr/bin/env python3
"""PRD 前置业务知识门禁：只读汇总推荐、跨域影响和保鲜状态。

这是工作流适配器，不是第二个知识库。它委托 business-knowledge.py，
不修改需求草稿、PRD、业务知识视图或云端文档。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).with_name("business-knowledge.py")


def run_json(args: list[str]) -> tuple[dict, str | None]:
    try:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *args, "--json"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except OSError as exc:
        return {}, str(exc)
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        if result.returncode != 0:
            return {}, (result.stderr or result.stdout or f"exit {result.returncode}").strip()
        return {}, f"invalid json: {exc}"
    return value if isinstance(value, dict) else {"matches": value}, None


def main() -> int:
    parser = argparse.ArgumentParser(description="PRD 前置业务知识推荐与跨域影响检查")
    parser.add_argument("--project-dir", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--impact-limit", type=int, default=8)
    parser.add_argument("--max-age", type=int, default=90)
    parser.add_argument("--include-drafts", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    requirement = args.project_dir / "01-requirement-draft.md"
    output: dict[str, object] = {
        "project_dir": str(args.project_dir),
        "requirement": str(requirement),
        "source": "business-knowledge-view",
        "readonly": True,
    }
    freshness, freshness_error = run_json(["freshness", "--max-age", str(args.max_age)])
    if freshness_error:
        output["freshness"] = {"status": "unavailable", "error": freshness_error}
    else:
        output["freshness"] = freshness
    recommendation, recommendation_error = run_json(
        ["recommend", "--requirement", str(requirement), "--limit", str(args.limit)]
        + (["--include-drafts"] if args.include_drafts else [])
    )
    if recommendation_error:
        output["recommendation"] = {"status": "unavailable", "error": recommendation_error}
        output["impact"] = {"status": "skipped", "reason": "recommendation unavailable"}
    else:
        output["recommendation"] = recommendation
        terms = recommendation.get("terms") or []
        if terms:
            impact, impact_error = run_json(
                ["impact", " ".join(str(term) for term in terms), "--limit", str(args.impact_limit)]
                + (["--include-drafts"] if args.include_drafts else [])
            )
            output["impact"] = impact if not impact_error else {"status": "unavailable", "error": impact_error}
        else:
            output["impact"] = {"status": "skipped", "reason": "no business terms"}
    if args.json:
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print("PRD 前置业务知识检查（只读）")
        print(f"- 保鲜：{(output.get('freshness') or {}).get('status', 'unavailable')}")
        rec = output.get("recommendation") or {}
        print(f"- 关键词：{'、'.join(rec.get('terms') or []) or '—'}")
        for row in rec.get("matches") or []:
            print(f"- 推荐：[{row.get('id')}] {row.get('title')} · {row.get('domain')}")
        impact = output.get("impact") or {}
        print(f"- 影响域：{'、'.join(impact.get('domains') or []) or '—'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
