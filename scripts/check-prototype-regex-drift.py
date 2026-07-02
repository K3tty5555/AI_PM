#!/usr/bin/env python3
"""原型示意 cell 判定正则跨副本漂移检测。

背景：源侧校验器（git 追踪）、云侧校验器 + push 计数器（xfchat-wiki，gitignore 本机插件）
各持一份 POINTER / LEGACY / REUSE 正则拷贝——两个 skill 独立分发、不能跨 import，
重复是架构必需，但会漂移（同 check-rule-drift.sh 检查 6 的行话表两副本逻辑）。
本脚本用 AST 提取 re.compile 字面量做精确比对（宁窄勿宽：只比零歧义的 pattern 字符串）。

唯一源：docs/2026-07-02-aipm-prototype-cell-validators-iteration-plan.md 附录 A。
xfchat-wiki 不存在（fresh clone）时跳过、退出码 0。

用法：python3 scripts/check-prototype-regex-drift.py   # 0=一致/跳过，1=漂移
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_VALIDATOR = ROOT / ".claude/skills/ai-pm/scripts/validate_prd_source_prototype_cells.py"
CLOUD_VALIDATOR = ROOT / ".claude/skills/xfchat-wiki/scripts/validate_prd_prototype_cells.py"
PUSH_RENDERER = ROOT / ".claude/skills/xfchat-wiki/scripts/feishu_doc.py"

# (逻辑名, 文件, 该文件里的变量名)；同一逻辑名的 pattern 字符串必须完全一致
CHECKS = [
    ("POINTER", SOURCE_VALIDATOR, "POINTER_RE"),
    ("POINTER", CLOUD_VALIDATOR, "POINTER_RE"),
    ("LEGACY", SOURCE_VALIDATOR, "LEGACY_PROTO_RE"),
    ("LEGACY", CLOUD_VALIDATOR, "LEGACY_RE"),
    ("LEGACY", PUSH_RENDERER, "_LEGACY_PROTO_ROW_RE"),
    ("REUSE", SOURCE_VALIDATOR, "REUSE_RE"),
    ("REUSE", CLOUD_VALIDATOR, "REUSE_RE"),
]


def extract_compile_patterns(path: Path) -> dict[str, str]:
    """提取模块级 `X = re.compile("字面量")` 的 pattern 字符串。"""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    patterns: dict[str, str] = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        call = node.value
        if not isinstance(target, ast.Name) or not isinstance(call, ast.Call):
            continue
        func = call.func
        if not (isinstance(func, ast.Attribute) and func.attr == "compile"
                and isinstance(func.value, ast.Name) and func.value.id == "re"):
            continue
        if call.args and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str):
            patterns[target.id] = call.args[0].value
    return patterns


def main() -> int:
    if not CLOUD_VALIDATOR.exists():
        print("⏭️  xfchat-wiki 本机插件不存在，跳过原型正则漂移检查（fresh clone 属正常）")
        return 0

    by_file: dict[Path, dict[str, str]] = {}
    failures: list[str] = []
    groups: dict[str, list[tuple[Path, str, str | None]]] = {}
    for logical, path, var in CHECKS:
        if path not in by_file:
            if not path.exists():
                failures.append(f"文件缺失：{path.relative_to(ROOT)}")
                by_file[path] = {}
            else:
                by_file[path] = extract_compile_patterns(path)
        groups.setdefault(logical, []).append((path, var, by_file[path].get(var)))

    for logical, entries in groups.items():
        values = {v for _, _, v in entries if v is not None}
        missing = [(p, var) for p, var, v in entries if v is None]
        for path, var in missing:
            failures.append(f"{logical}: {path.relative_to(ROOT)} 缺少 re.compile 字面量变量 {var}")
        if len(values) > 1:
            failures.append(f"{logical}: 各副本 pattern 不一致——")
            for path, var, v in entries:
                failures.append(f"    {path.relative_to(ROOT)}::{var} = {v!r}")

    if failures:
        print("❌ 原型示意判定正则漂移：")
        for line in failures:
            print(f"  {line}")
        print("  统一口径唯一源：docs/2026-07-02-aipm-prototype-cell-validators-iteration-plan.md 附录 A")
        return 1

    print(f"✅ 原型示意判定正则 {len(groups)} 组跨副本一致（源侧校验器 / 云侧校验器 / push 计数器）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
