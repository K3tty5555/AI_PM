#!/usr/bin/env python3
"""B4 历史 PRD 批量重渲 · 盘点工具（合并计划波1；6-29 WS-1 的拦路石=token 无台账）。

产出「PRD × doc_token × 是否含旧渲染」勾选清单（只盘点不改动）：
    python3 scripts/prd_rerender_survey.py [--project <项目目录>] [--out <报告.md>]

盘点来源三层合并：
1. 各项目 _status.json 的 cloud_docs 登记（有 token 的增量层）；
2. 未登记的历史正本：按 05-prd 下 PRD 文件名 search_docs 精确同名找 token；
3. 找到 token 的逐篇跑云侧校验器口径（legacy 原型行数），legacy>0 = 待重渲候选。

安全线：本工具零写操作；重渲执行按 v2.0 波1 流程「用户勾选 → 分批 → 逐篇读回验证 →
回填 cloud_docs」另行进行（重渲前必须逐篇 block 结构读 + list_comments 防手改丢失）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
XFCHAT = REPO / ".claude" / "skills" / "xfchat-wiki" / "scripts"
sys.path.insert(0, str(XFCHAT))

sys.path.insert(0, str(REPO / "scripts"))
try:
    from feishu_doc import count_blocks, get_doc_raw_text, count_legacy_prototype_rows  # noqa: E402
    from feishu_other import search_docs  # noqa: E402
except ImportError:
    sys.exit("❌ 依赖本机私有插件 xfchat-wiki（不随仓分发）")
from _prd_common import find_token_by_title as _find  # noqa: E402


def find_token_by_title(title: str) -> str | None:
    return _find(title, search_docs)


def legacy_rows(doc_id: str) -> int | None:
    """云侧 legacy 原型行数——真·复用 xfchat 校验器口径 count_legacy_prototype_rows
    （此前自造粗正则会把「查看原型设计稿」链接/图片 alt 误判成待重渲，review 修复批换掉）。"""
    try:
        raw = (get_doc_raw_text(doc_id) or {}).get("content") or ""
        if not raw:
            return None
        return count_legacy_prototype_rows(raw)
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", help="只盘一个项目；缺省=output/projects 全部")
    ap.add_argument("--out", help="清单落盘路径（缺省只打印）")
    a = ap.parse_args()

    projects = [Path(a.project)] if a.project else sorted((REPO / "output/projects").glob("*/"))
    rows = []
    for proj in projects:
        sp = proj / "_status.json"
        cloud = {}
        if sp.exists():
            cloud = (json.loads(sp.read_text(encoding="utf-8")) or {}).get("cloud_docs") or {}
        prd_dir = proj / "05-prd"
        if not prd_dir.exists():
            continue
        for md in sorted(prd_dir.glob("*.md")):
            if md.name == "README.md":
                continue
            title = re.sub(r"\.md$", "", md.name)
            reg = cloud.get(md.name) or {}
            tok = reg.get("doc_token")
            src = "登记" if tok else ""
            if not tok:
                tok = find_token_by_title(title)
                src = "搜索" if tok else "无"
            legacy = legacy_rows(tok) if tok else None
            alive = None
            if tok:
                alive = bool((count_blocks(tok) or {}).get("total"))
            rows.append({
                "project": proj.name, "prd": md.name, "token": tok or "",
                "token_src": src, "alive": alive, "legacy": legacy,
            })
            mark = "🔧待重渲" if (legacy or 0) > 0 else ("✓" if alive else ("💀" if tok else "—"))
            print(f"  {mark} [{proj.name}] {md.name[:44]} token={src} legacy={legacy}")

    cand = [r for r in rows if (r["legacy"] or 0) > 0]
    print(f"\n盘点完成：PRD {len(rows)} 份 / 有 token {sum(1 for r in rows if r['token'])} / 待重渲候选 {len(cand)}")
    if a.out:
        out = Path(a.out)
        lines = ["# 历史 PRD 重渲盘点（B4）\n", "| 勾选 | 项目 | PRD | token | 来源 | legacy 行 |", "|---|---|---|---|---|---|"]
        for r in rows:
            lines.append(f"| [ ] | {r['project']} | {r['prd']} | {r['token'][:18]} | {r['token_src']} | {r['legacy']} |")
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"清单已写 {out}（勾选后分批执行重渲，重渲前逐篇 block 读+评论检查防丢手改）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
