#!/usr/bin/env python3
"""云端 PRD → 本地 md 的内容层回收（合并计划波1 · N1 人改回收/同步命令）。

用法：
    python3 scripts/prd_pull.py --md <PRD.md> --project <项目目录> [--doc-id <token>] [--apply]

语义（往返保真边界，v2.0 §波1）：
- **本地 md 永远是源**（含云增强标记层：<红>/<灰>/==核心==/callout/fold）。
- 云端手改只在**内容层**回收：按章节（heading）切块、双侧归一化后比对，
  只把"云端改了内容"的章节回写本地；**含标记/图片的章节不自动回写**，
  标记层以本地为准，列为「需手工合并」——绝不用云端全文覆盖本地。
- --apply 成功后刷新 cloud_docs 登记的块数（让下次 push 的人改保护对上账）。
- 不带 --apply = 只出 diff 报告（预览模式，默认）。
隐私：同 prd_publish——入口零内部域名，实现依赖本机 xfchat-wiki 插件。
"""
import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
XFCHAT = REPO / ".claude" / "skills" / "xfchat-wiki" / "scripts"
sys.path.insert(0, str(XFCHAT))

try:
    from feishu_doc import blocks_to_markdown, count_blocks  # noqa: E402
except ImportError:
    sys.exit(
        "❌ 本命令依赖本机私有插件 xfchat-wiki（gitignore 不随仓分发）。\n"
        "   fresh clone 用户无法使用云文档同步——设计如此（云文档域=私有部署）。"
    )

MARKER_RE = re.compile(r"</?红>|</?灰>|==([^=\n]+)==")
IMG_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")
CALLOUT_RE = re.compile(r"^> \[!(?:TIP|WARNING|NOTE)\]\s*", re.M)
FOLD_RE = re.compile(r"<!--\s*/?fold\s*-->|<!--\s*columns[^>]*-->")


def normalize(text: str) -> str:
    """内容层归一：剥标记/图片占位/callout 语法/fold 注释/空白，用于双侧比对。"""
    t = MARKER_RE.sub(lambda m: m.group(1) or "", text)
    t = IMG_RE.sub("[图片]", t)
    t = CALLOUT_RE.sub("> ", t)
    t = FOLD_RE.sub("", t)
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in t.split("\n")]
    return "\n".join(ln for ln in lines if ln)


def split_sections(md: str) -> list[tuple[str, str]]:
    """按 1-6 级 heading 切章节（云端渲染层级可能与本地不同，靠 head_key 归一匹配）。"""
    sections, cur_head, cur = [], "_head", []
    for ln in md.split("\n"):
        if re.match(r"^#{1,6} ", ln):
            sections.append((cur_head, "\n".join(cur)))
            cur_head, cur = ln.strip(), []
        else:
            cur.append(ln)
    sections.append((cur_head, "\n".join(cur)))
    return sections


def head_key(h: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"^#+\s*", "", h))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", required=True)
    ap.add_argument("--project", required=True)
    ap.add_argument("--doc-id")
    ap.add_argument("--apply", action="store_true", help="把云端内容层改动回写本地（默认只预览）")
    a = ap.parse_args()

    md_path = Path(a.md).resolve()
    project = Path(a.project).resolve()
    key = md_path.name
    status_path = project / "_status.json"
    status = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {}
    reg = (status.get("cloud_docs") or {}).get(key) or {}
    doc_id = a.doc_id or reg.get("doc_token")
    if not doc_id:
        sys.exit(f"❌ 未找到 {key} 的 cloud_docs 登记，也未指定 --doc-id")

    print(f"[1/3] 拉取云端 {doc_id[:16]}… → markdown")
    cloud_md = blocks_to_markdown(doc_id)
    if not cloud_md or len(cloud_md) < 20:
        sys.exit("❌ 云端渲染结果为空/过短，中止（先核 doc token 与权限）")

    local_md = md_path.read_text(encoding="utf-8")
    loc = {head_key(h): (h, b) for h, b in split_sections(local_md)}
    cld = {head_key(h): (h, b) for h, b in split_sections(cloud_md)}

    changed, conflicts, cloud_only, local_only = [], [], [], []
    for k, (h, cb) in cld.items():
        if k == "_head":
            continue
        if k not in loc:
            cloud_only.append(h)
            continue
        lh, lb = loc[k]
        if normalize(lb) != normalize(cb):
            if MARKER_RE.search(lb) or IMG_RE.search(lb) or CALLOUT_RE.search(lb):
                conflicts.append((lh, cb))
            else:
                changed.append((lh, cb))
    for k, (h, _) in loc.items():
        if k != "_head" and k not in cld:
            local_only.append(h)

    print(f"[2/3] 内容层 diff：可回写 {len(changed)} 节 / 标记冲突需手工 {len(conflicts)} 节"
          f" / 云端独有 {len(cloud_only)} / 本地独有 {len(local_only)}")
    for h, _ in changed:
        print(f"      ✏️ 云端改了：{h}")
    for h, _ in conflicts:
        print(f"      ⚠️ 含标记/图，需手工合并：{h}")
    for h in cloud_only:
        print(f"      ➕ 云端新增章节（本地没有，需手工决定去留）：{h}")
    for h in local_only:
        print(f"      ➖ 本地独有章节（云端已删或未推）：{h}")

    if not a.apply:
        print("[3/3] 预览模式结束（--apply 执行回写；标记冲突节永远不自动回写）")
        return 0
    if not changed:
        print("[3/3] 无可自动回写的章节；标记冲突节请手工合并")
    else:
        new_md = local_md
        applied = 0
        for lh, cb in changed:
            _, lb = loc[head_key(lh)]
            old_block = lh + "\n" + lb
            new_block = lh + "\n" + cb.strip("\n")
            if old_block in new_md:
                new_md = new_md.replace(old_block, new_block, 1)
                applied += 1
            else:
                print(f"      ⚠️ 定位失败（跳过）：{lh}")
        md_path.write_text(new_md, encoding="utf-8")
        back = md_path.read_text(encoding="utf-8")
        print(f"[3/3] 回写 {applied}/{len(changed)} 节 ✓（读回 {len(back)} 字）")
    # 刷新登记块数，让下次 push 人改保护对上账
    if reg:
        cur = count_blocks(doc_id)
        reg["blocks"] = cur.get("total")
        status["cloud_docs"][key] = reg
        status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"      cloud_docs.blocks 已刷新为 {reg['blocks']}（人改保护基线对齐）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
