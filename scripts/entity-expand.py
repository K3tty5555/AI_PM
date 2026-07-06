#!/usr/bin/env python3
"""业务实体同物异名扩展（Stage4-B2）：搜之前把词扩成同组所有叫法，防漏检。

数据源=`scripts/.metrics-dict.md` 的「## 表三 · 同物异名归一」（gitignore 本机文件；
入库占位见 `.metrics-dict.example.md`）。别名表治「检索层」漏检，B1 字典表二治「理解层」
混淆——两者同文件、互补不重复。

用法：
    python3 scripts/entity-expand.py "<实体名>"          # 输出同组所有叫法（每行一个）
    python3 scripts/entity-expand.py "<实体名>" --grep    # 输出 grep -E 正则：(叫法1|叫法2|…)
    python3 scripts/entity-expand.py --list             # 列所有归一组
命中规范名或任一别名 → 返回该组全部；找不到 → 原样返回输入词（grep 就查原词，不报错）。

设计纪律：只读、亚秒（静默护栏）；宁窄勿宽（表三只收「确定同一物」，脚本不做模糊猜测）。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

DICT = Path(__file__).resolve().parent / ".metrics-dict.md"
SPLIT = re.compile(r"[、,，/]+")


def load_groups() -> list[list[str]]:
    """解析表三，返回 [[规范名, 别名1, 别名2, ...], ...]。"""
    if not DICT.exists():
        return []
    lines = DICT.read_text(encoding="utf-8").splitlines()
    groups: list[list[str]] = []
    in_tbl = False
    for ln in lines:
        if ln.startswith("## "):
            in_tbl = "表三" in ln
            continue
        if not in_tbl:
            continue
        s = ln.strip()
        if not s.startswith("|"):
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if len(cells) < 2:
            continue
        canon = cells[0]
        # 跳过表头行与分隔行
        if canon in ("规范名", "") or set(cells[0]) <= set("-: "):
            continue
        aliases = [a.strip() for a in SPLIT.split(cells[1]) if a.strip()]
        group = [canon] + [a for a in aliases if a != canon]
        # 去掉别名里的 markdown 强调符
        group = [re.sub(r"[*`]", "", g) for g in group]
        if group:
            groups.append(group)
    return groups


def expand(term: str, groups: list[list[str]]) -> list[str]:
    # 精确匹配（宁窄勿宽）：子串匹配会把短词错并进「包含它的长词」组（如载体名 vs 权限项名），
    # 正是别名表最该避免的错误合并。只在输入精确等于某成员时才归组。
    t = term.strip()
    for g in groups:
        if t in g:
            return g
    return [t]


def main() -> int:
    args = sys.argv[1:]
    groups = load_groups()
    if not args or args[0] == "--list":
        if not groups:
            print("（表三为空或字典文件不存在）")
            return 0
        for g in groups:
            print(f"{g[0]}  ←  " + "、".join(g[1:]) if len(g) > 1 else g[0])
        return 0
    term = args[0]
    as_grep = "--grep" in args[1:]
    hits = expand(term, groups)
    if as_grep:
        print("(" + "|".join(re.escape(h) for h in hits) + ")")
    else:
        for h in hits:
            print(h)
    return 0


if __name__ == "__main__":
    sys.exit(main())
