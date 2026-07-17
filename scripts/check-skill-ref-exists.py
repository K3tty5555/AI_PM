#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Skill 引用存在性检查：扫 .claude/skills 下所有 .md 正文里"反引号包起来的文件路径引用"
是否指向真实存在的文件，揪出悬空引用（如 battlecard 路径归属错那种）。

为什么用 python 不用 bash：精确匹配需要"路径不从中间截断 + 排除项目产物路径"，
bash grep 部分匹配会把 `07-references/README.md`、`ai-pm-prd/references/x.md` 截成
`references/...` 误报（踩过，见 pitfall_bash_utf8_var_mangle 同族坑），python re 干净。

检查范围（刻意收窄到"零歧义、价值最高"的一类，不假装能查所有形态）：
  只查 反引号内、不含通配符 `*`、以 `.claude/` 或 `templates/` 开头的**全路径**引用。
  —— 这类无歧义（如 battlecard、live-probe 全路径），且最容易"路径归属写错"（本轮真问题就是这类）。
  跳过的（歧义大/价值低，交给人工 review）：
    - 裸 `references/x` `scripts/x`（相对哪个 skill 有歧义、_core 子目录会向上指）
    - 跨 skill 相对 `<skill>/references/x`（多数写法正确，逐一解析易引入新误报）
    - glob 通配（`*-frameworks.md` 等，是"扫某类文件"的描述不是具体引用）
    - 项目运行时产物（`07-references/` `output/` `{占位}`）
为什么这么窄：核查证明 skill 引用整体健康，继续打磨全形态精确匹配边际收益极低、易引入新误报。
诚实 > 假精确——脚本只担保它能担保的那部分，可干净做 gate。
退出码非 0 = 有悬空引用，可做 PR gate / session-start。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS = os.path.join(ROOT, ".claude", "skills")

skill_names = {
    d for d in os.listdir(SKILLS)
    if os.path.isdir(os.path.join(SKILLS, d))
}

TOKEN_RE = re.compile(r"`([^`]+?\.(?:md|sh|py|cjs|js))`")
# 项目运行时产物 / 占位路径前缀（非 skill 资源，跳过）
SKIP_PREFIX = ("07-references/", "output/", "templates/project-index/")


def skill_root_of(doc_path):
    rel = os.path.relpath(doc_path, SKILLS)
    return os.path.join(SKILLS, rel.split(os.sep)[0])


def resolve(token, doc_path):
    """返回候选绝对路径列表；任一存在即视为有效引用。范围外一律返回 None（不检查）。"""
    if "*" in token:
        return None  # glob 通配，是"扫某类文件"的描述不是具体引用
    if "{" in token or "}" in token:
        return None  # 运行时占位
    if token.startswith(SKIP_PREFIX):
        return None  # 项目产物
    # 只查零歧义的仓库根全路径
    if token.startswith((".claude/", "templates/")):
        return [os.path.join(ROOT, token)]
    return None  # 裸 references/、跨 skill 相对、散文相对名 → 歧义大，不机械查


def main():
    dangling = []
    for dirpath, _, files in os.walk(SKILLS):
        for fn in files:
            if not fn.endswith(".md"):
                continue
            doc = os.path.join(dirpath, fn)
            with open(doc, encoding="utf-8") as f:
                text = f.read()
            for token in sorted(set(TOKEN_RE.findall(text))):
                cands = resolve(token, doc)
                if cands is None:
                    continue
                if not any(os.path.exists(c) for c in cands):
                    dangling.append((os.path.relpath(doc, ROOT), token))

    print("----")
    if dangling:
        for d, t in dangling:
            print(f"DANGLING: {d} -> {t}")
        print(f"FAIL: 发现 {len(dangling)} 处悬空引用（指向不存在的文件）")
        return 1
    print("OK: skill 反引号路径引用全部指向真实文件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
