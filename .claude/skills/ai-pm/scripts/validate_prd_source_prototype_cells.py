#!/usr/bin/env python3
"""Validate PRD Markdown uses the cloud-doc prototype image cell contract.

Checks only the source Markdown. It does not inspect cloud document blocks.
Use xfchat-wiki/scripts/validate_prd_prototype_cells.py after pushing.

判定协议（first-match 早退，与云侧 should_expect_image 保持一致；
唯一源见 docs/2026-07-02-aipm-prototype-cell-validators-iteration-plan.md §三/附录A）：
空 → no-ui → 待补 → cell内图 → 交叉引用 → 指向语(error) → 旧占位(warn，仅云增强档)
→ 复用语(pass) → 裸提示词(warn) → 其余(pass)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path


DETAIL_HEADING_RE = re.compile(r"^##\s+.*详细功能设计.*$")
NEXT_H2_RE = re.compile(r"^##\s+")
TABLE_ROW_RE = re.compile(r"^\s*\|.*\|\s*$")
IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")
# (?!\() 排除 markdown 链接 [xxx原型](url)
LEGACY_PROTO_RE = re.compile(r"(?<!!)\[[^\]]*原型[^\]]*\](?!\()")
PENDING_PROTO_RE = re.compile(r"\[待补原型[:：][^\]]+\]")
CROSS_REF_RE = re.compile(r"(?:见|参见)\s*§|(?:见|参见)\s*\d+(?:\.\d+)+")
# 指向语：见/如/详见/参见+图、上图/下图所示、裸上图/下图（排除"以下图片""线上图表"）
POINTER_RE = re.compile(r"(?:见|如|详见|参见)\s*[上下]?图|[上下]图所示|(?<![以线])[上下]图")
# 复用语（强形态才豁免）：同V1.1 / 同§6.3 / 同6.1 / 同上 / 复用 / 沿用 / 与…一致（排除"不一致"）
REUSE_RE = re.compile(r"同\s*[Vv]\d|同\s*§|同\s*\d+(?:\.\d+)+|同上|复用|沿用|与[^，。；]{1,20}?(?<!不)一致")
BARE_HINT_RE = re.compile(r"截图|实拍|原型图")
NO_UI_KEYS = ("无界面交互", "不涉及界面", "无需原型", "不需要原型")
CLOUD_MARKER = "<!-- output-profile: cloud_doc_enhanced -->"


@dataclass
class Issue:
    severity: str
    line: int
    code: str
    message: str
    text: str


def classify_prototype_cell(value: str) -> str:
    """原型示意右侧 cell 的状态判定（first-match 早退）。"""
    text = value.strip()
    if not text:
        return "empty"
    if any(key in text for key in NO_UI_KEYS):
        return "no-ui"
    if PENDING_PROTO_RE.search(text):
        return "pending"
    if IMAGE_RE.search(text):
        return "cell-image"
    if CROSS_REF_RE.search(text):
        return "cross-ref"
    if POINTER_RE.search(text):
        return "points-outside"
    if LEGACY_PROTO_RE.search(text):
        return "legacy"
    if REUSE_RE.search(text):
        return "reuse"
    if BARE_HINT_RE.search(text):
        return "ambiguous"
    return "text-only"


def split_markdown_row(line: str) -> list[str]:
    raw = line.strip()
    if raw.startswith("|"):
        raw = raw[1:]
    if raw.endswith("|"):
        raw = raw[:-1]
    cells: list[str] = []
    current: list[str] = []
    escaped = False
    for char in raw:
        if escaped:
            current.append(char)
            escaped = False
            continue
        if char == "\\":
            current.append(char)
            escaped = True
            continue
        if char == "|":
            cells.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    cells.append("".join(current).strip())
    return cells


def normalize_label(text: str) -> str:
    return text.strip().strip("*").strip()


def detail_section_bounds(lines: list[str]) -> tuple[int, int] | None:
    start = None
    for index, line in enumerate(lines):
        if DETAIL_HEADING_RE.match(line.strip()):
            start = index
            break
    if start is None:
        return None
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if NEXT_H2_RE.match(lines[index].strip()):
            end = index
            break
    return start, end


def is_separator_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def validate_text(text: str) -> dict[str, object]:
    lines = text.splitlines()
    bounds = detail_section_bounds(lines)
    if bounds is None:
        return {
            "ok": False,
            "error": "未找到包含“详细功能设计”的二级标题",
        }
    # 旧占位对本地 DOCX 项目是正确格式，只在云增强档 PRD 上出 warn（marker 在 H1 之上）
    is_cloud_enhanced = any(line.strip() == CLOUD_MARKER for line in lines[:50])

    start, end = bounds
    issues: list[Issue] = []
    counts = {
        "prototype_rows": 0,
        "rows_with_cell_images": 0,
        "rows_no_ui": 0,
        "rows_pending": 0,
        "rows_legacy": 0,
        "rows_reuse": 0,
    }

    previous_significant_was_proto_row = False

    for offset, line in enumerate(lines[start + 1 : end], start=start + 2):
        stripped = line.strip()
        is_table = bool(TABLE_ROW_RE.match(line))
        if not stripped:
            previous_significant_was_proto_row = False
            continue

        if is_table:
            cells = split_markdown_row(line)
            if is_separator_row(cells):
                continue
            if len(cells) >= 2 and normalize_label(cells[0]) == "原型示意":
                counts["prototype_rows"] += 1
                state = classify_prototype_cell(cells[1])
                if state == "cell-image":
                    counts["rows_with_cell_images"] += 1
                elif state == "no-ui":
                    counts["rows_no_ui"] += 1
                elif state == "pending":
                    counts["rows_pending"] += 1
                elif state == "reuse":
                    counts["rows_reuse"] += 1
                elif state == "points-outside":
                    issues.append(
                        Issue(
                            severity="error",
                            line=offset,
                            code="prototype_row_points_outside",
                            message="原型示意指向表外图片；应改为 `![xxx原型](path)<br>布局描述` 或明确待补/无界面交互",
                            text=line,
                        )
                    )
                elif state == "legacy":
                    counts["rows_legacy"] += 1
                    if is_cloud_enhanced:
                        issues.append(
                            Issue(
                                severity="warn",
                                line=offset,
                                code="legacy_prototype_placeholder",
                                message="原型示意仍使用旧 `[xxx原型]` 占位；云文档不会据此生成 cell 内图片",
                                text=line,
                            )
                        )
                elif state == "ambiguous":
                    issues.append(
                        Issue(
                            severity="warn",
                            line=offset,
                            code="prototype_row_ambiguous",
                            message="原型示意提到截图/原型图但无图无指向语；若确有图请写 `![](path)`，复用请写「同V…」",
                            text=line,
                        )
                    )
                previous_significant_was_proto_row = True
            else:
                previous_significant_was_proto_row = False
            continue

        if IMAGE_RE.search(line):
            if previous_significant_was_proto_row:
                issues.append(
                    Issue(
                        severity="error",
                        line=offset,
                        code="image_after_prototype_row",
                        message="原型图紧跟在原型示意行后，但不在 cell 内；应写进右侧 cell",
                        text=line,
                    )
                )
            else:
                issues.append(
                    Issue(
                        severity="error",
                        line=offset,
                        code="top_level_image_in_detail_section",
                        message="详细功能设计区存在表外 Markdown 图片；云文档会生成顶层 image block",
                        text=line,
                    )
                )
            previous_significant_was_proto_row = False
            continue

        previous_significant_was_proto_row = False

    errors = [issue for issue in issues if issue.severity == "error"]
    warnings = [issue for issue in issues if issue.severity == "warn"]
    counts["errors"] = len(errors)
    counts["warnings"] = len(warnings)
    return {
        "ok": not errors,
        "cloud_enhanced": is_cloud_enhanced,
        "counts": counts,
        "issues": [asdict(issue) for issue in issues],
    }


def validate_file(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    result = validate_text(text)
    return {"file": str(path), **result}


# ---------------------------------------------------------------- selftest

CLASSIFY_CASES = [
    ("![制卡列表预览入口](../06-prototype/screenshots/x.png)<br>操作列新增预览入口", "cell-image"),
    ("无界面交互（识别能力优化）", "no-ui"),
    ("[待补原型：小题合并拆分] 左栏题型列表", "pending"),
    ("同V1.1原型图，仅按钮文案变化", "reuse"),
    ("同 V1.1 原型图", "reuse"),
    ("同§6.3", "reuse"),
    ("同6.1，入口文案不同", "reuse"),
    ("布局同上", "reuse"),
    ("与V1一致", "reuse"),
    ("沿用现网列表页布局", "reuse"),
    ("与V1不一致，改为双栏", "text-only"),
    ("同2期规划", "text-only"),
    ("见下图", "points-outside"),
    ("同V1.1，详见下图", "points-outside"),
    ("复用现网截图（见下图）", "points-outside"),
    ("同上图", "points-outside"),
    ("如下图所示", "points-outside"),
    ("以下图片仅供参考", "text-only"),
    ("线上图表展示区", "text-only"),
    ("现网截图 + 标注", "ambiguous"),
    ("[制卡预览原型] 左侧列表 + 右侧预览", "legacy"),
    ("同V1.1[登录页原型]", "legacy"),
    ("[登录页原型](https://wiki.example.com/x)", "text-only"),
    ("见§6.2", "cross-ref"),
    ("参见 6.1 布局", "cross-ref"),
]

_DOC_OK = """## 六、详细功能设计

### 6.1 带图

| 项目 | 内容 |
|------|------|
| **原型示意** | ![功能原型](../06-prototype/screenshots/a.png)<br>布局描述 |

### 6.2 复用

| 项目 | 内容 |
|------|------|
| **原型示意** | 同V1.1原型图，仅按钮文案变化 |

## 七、兼容
"""

_DOC_BAD = """## 六、详细功能设计

### 6.1 指向表外

| 项目 | 内容 |
|------|------|
| **原型示意** | 见下图 |
| **优先级** | P0 |

![原型](../06-prototype/screenshots/foo.png)

### 6.2 旧占位

| 项目 | 内容 |
|------|------|
| **原型示意** | [制卡预览原型] 左侧列表 |

## 七、兼容
"""

_DOC_INLINE_IMG = """## 六、详细功能设计

| 项目 | 内容 |
|------|------|
| **原型示意** | 见下图 |
![原型2](shots/bar.png)

## 七、兼容
"""


def run_selftest() -> int:
    failed = 0
    for value, expected in CLASSIFY_CASES:
        got = classify_prototype_cell(value)
        if got != expected:
            failed += 1
            print(f"FAIL classify {value!r}: expected {expected}, got {got}")

    def doc_case(name, text, expect_ok, expect_codes, expect_warnings=0):
        nonlocal failed
        result = validate_text(text)
        codes = sorted(issue["code"] for issue in result.get("issues", []))
        ok = result.get("ok")
        warnings = (result.get("counts") or {}).get("warnings", 0)
        if ok != expect_ok or codes != sorted(expect_codes) or warnings != expect_warnings:
            failed += 1
            print(f"FAIL doc {name}: ok={ok} codes={codes} warnings={warnings}, "
                  f"expected ok={expect_ok} codes={sorted(expect_codes)} warnings={expect_warnings}")

    doc_case("ok", _DOC_OK, True, [])
    # 无云增强 marker：旧占位只计数不出 warn
    doc_case("bad-plain", _DOC_BAD, False,
             ["prototype_row_points_outside", "top_level_image_in_detail_section"], 0)
    # 有云增强 marker：旧占位出 warn
    doc_case("bad-cloud", CLOUD_MARKER + "\n" + _DOC_BAD, False,
             ["legacy_prototype_placeholder", "prototype_row_points_outside",
              "top_level_image_in_detail_section"], 1)
    doc_case("inline-img", _DOC_INLINE_IMG, False,
             ["image_after_prototype_row", "prototype_row_points_outside"], 0)

    bad_counts = validate_text(_DOC_BAD).get("counts") or {}
    if bad_counts.get("rows_legacy") != 1:
        failed += 1
        print(f"FAIL doc bad-plain: rows_legacy={bad_counts.get('rows_legacy')}, expected 1")

    total = len(CLASSIFY_CASES) + 5
    if failed:
        print(f"SELFTEST FAIL: {failed}/{total} case(s) failed")
        return 1
    print(f"SELFTEST PASS: {total} cases")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate PRD Markdown prototype images are in table cells.")
    parser.add_argument("files", nargs="*", help="PRD Markdown files")
    parser.add_argument("--quiet", action="store_true", help="print compact summary")
    parser.add_argument("--strict-warnings", action="store_true", help="return non-zero when warnings exist")
    parser.add_argument("--selftest", action="store_true", help="run embedded fixtures and exit")
    args = parser.parse_args()

    if args.selftest:
        return run_selftest()
    if not args.files:
        parser.error("需要 PRD 文件路径，或使用 --selftest")

    results = []
    for file_arg in args.files:
        path = Path(file_arg)
        if not path.exists():
            results.append({"file": str(path), "ok": False, "error": "file not found"})
            continue
        try:
            results.append(validate_file(path))
        except Exception as exc:
            results.append({"file": str(path), "ok": False, "error": str(exc)})

    has_error = any((not item.get("ok")) or item.get("error") for item in results)
    has_warning = any(((item.get("counts") or {}).get("warnings") or 0) for item in results)

    if args.quiet:
        for item in results:
            if item.get("error"):
                print(f"ERROR {item['file']}: {item['error']}")
                continue
            counts = item.get("counts") or {}
            status = "PASS" if item.get("ok") else "FAIL"
            print(
                f"{status} {item['file']}: "
                f"prototype_rows={counts.get('prototype_rows', 0)}, "
                f"cell_images={counts.get('rows_with_cell_images', 0)}, "
                f"reuse={counts.get('rows_reuse', 0)}, "
                f"legacy={counts.get('rows_legacy', 0)}, "
                f"errors={counts.get('errors', 0)}, warnings={counts.get('warnings', 0)}"
            )
    else:
        print(json.dumps({"ok": not has_error, "results": results}, ensure_ascii=False, indent=2))

    if has_error:
        return 1
    if args.strict_warnings and has_warning:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
