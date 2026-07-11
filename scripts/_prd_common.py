"""prd_publish / prd_pull / prd_rerender_survey 共享常量与助手（review 修复批 · 2026-07-12）。

单一事实源：云增强标记/图片/callout 的正则只此一份——判断卡 §十 加新标记语法时改这里，
三个消费脚本自动同步（此前 publish/pull 各写一份已出现分叉：IMG_RE 捕获组、CALLOUT 尾空白）。
"""
from __future__ import annotations

import re

IMG_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
MARKER_RE = re.compile(r"</?红>|</?灰>|==([^=\n]+)==")
CALLOUT_RE = re.compile(r"^> \[!(?:TIP|WARNING|NOTE)\]\s*", re.M)
FOLD_RE = re.compile(r"<!--\s*/?fold\s*-->|<!--\s*columns[^>]*-->")
LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
TABLE_SEP_RE = re.compile(r"^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$")
CODE_FENCE_RE = re.compile(r"^```\w*\s*$", re.M)


def find_token_by_title(title: str, search_docs_fn) -> str | None:
    """按标题精确匹配找 doc token（结果嵌在 data 下——探针坑已记 memory）。"""
    try:
        hits = ((search_docs_fn(title, count=10) or {}).get("data") or {}).get("docs_entities") or []
    except Exception:
        return None
    for h in hits:
        if h.get("title") == title:
            return h.get("docs_token")
    return None


def code_fence_literals(md: str, literals: tuple[str, ...]) -> set[str]:
    """源 md 代码围栏里出现过哪些字面量（这些不算云端渲染残留——讲语法的示例文档合法含有）。"""
    found = set()
    in_code = False
    for ln in md.split("\n"):
        if ln.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            for lit in literals:
                if lit in ln:
                    found.add(lit)
    return found


def count_headings_for_push(md: str) -> int:
    """与 push 行为一致的源侧标题计数：1-6 级、跳过代码围栏内的 #、剥掉将被文档名承担的首行 H1。"""
    lines = md.split("\n")
    n = 0
    in_code = False
    for i, ln in enumerate(lines):
        if ln.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        if re.match(r"^#{1,6} ", ln):
            if i == 0 and ln.startswith("# "):
                continue  # push 前被剥、由文档名承担
            n += 1
    return n
