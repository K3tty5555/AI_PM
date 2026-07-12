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
import os
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

sys.path.insert(0, str(REPO / "scripts"))
from _prd_common import (  # noqa: E402
    IMG_RE, MARKER_RE, CALLOUT_RE, FOLD_RE, LINK_RE, TABLE_SEP_RE,
)


def normalize(text: str) -> str:
    """内容层归一：剥标记/图占位/callout/fold + **渲染往返噪音**（表格分隔行、链接 URL、
    代码围栏语言、\| 转义、粗斜删标记）——blocks_to_markdown 是有损渲染，这些差异不是"云端改了"。"""
    t = MARKER_RE.sub(lambda m: m.group(1) or "", text)
    t = IMG_RE.sub("[图片]", t)
    t = CALLOUT_RE.sub("> ", t)
    t = FOLD_RE.sub("", t)
    t = LINK_RE.sub(lambda m: m.group(1), t)          # 链接→纯文字（云端渲染丢 URL）
    t = re.sub(r"^```\w+\s*$", "```", t, flags=re.M)  # 代码围栏语言丢失
    t = t.replace("\\|", "|")                         # 转义竖线
    t = re.sub(r"\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|~~([^~\n]+)~~",
               lambda m: m.group(1) or m.group(2) or m.group(3), t)  # 粗/斜/删标记
    out = []
    for ln in t.split("\n"):
        if TABLE_SEP_RE.match(ln) and "-" in ln:
            continue                                    # 表格分隔行两侧写法不同，剥掉
        ln = re.sub(r"\s*\|\s*", "|", ln)              # 表格数据行管道符旁空白归一
        out.append(re.sub(r"\s+", " ", ln).strip())
    return "\n".join(ln for ln in out if ln)


def fragile(text: str) -> bool:
    """该章节含有损往返高危成分（标记/图/callout/表格/链接/代码块）→ 永不自动回写。"""
    return bool(MARKER_RE.search(text) or IMG_RE.search(text) or CALLOUT_RE.search(text)
                or LINK_RE.search(text) or "```" in text
                or re.search(r"^\s*\|.+\|", text, re.M))


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


def keyed_sections(md: str) -> dict:
    """复合键=父级标题链/自身标题（Codex 复验 2.4：同名标题曾被字典互覆丢节）。"""
    out = {}
    stack = []  # [(level, key)]
    for h, b in split_sections(md):
        if h == "_head":
            out["_head"] = (h, b)
            continue
        level = len(h) - len(h.lstrip("#"))
        while stack and stack[-1][0] >= level:
            stack.pop()
        key = "/".join(k for _, k in stack) + "/" + head_key(h)
        stack.append((level, head_key(h)))
        n = 1
        base = key
        while key in out:  # 同链同名兜底
            n += 1
            key = f"{base}#{n}"
        out[key] = (h, b)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--md")
    ap.add_argument("--project")
    ap.add_argument("--doc-id")
    ap.add_argument("--apply", action="store_true", help="把云端内容层改动回写本地（默认只预览；需发布基线）")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if not a.md or not a.project:
        sys.exit("❌ 需要 --md 与 --project（或 --selftest）")

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
    try:
        cloud_md = blocks_to_markdown(doc_id)
    except Exception as e:
        sys.exit(f"❌ 云端 API 不可用（{e}）——失败≠云端为空，恢复后重试")
    if not cloud_md or len(cloud_md) < 20:
        sys.exit("❌ 云端渲染结果为空/过短，中止（先核 doc token 与权限）")

    local_md = md_path.read_text(encoding="utf-8")
    # 三方基线（Codex 复验 P0-2.2）：没有基线不做自动回写——两方 diff 分不清"云端改了"和"本地新改了"
    base_path = project / "_cloud" / "baseline" / key
    base_md = base_path.read_text(encoding="utf-8") if base_path.exists() else None
    if a.apply and base_md is None:
        sys.exit("❌ 无发布基线（_cloud/baseline/，由 prd_publish v2 落）——两方 diff 无法判改动方向，"
                 "禁用 --apply；先预览人工合并，或重新 publish 建基线")
    loc = keyed_sections(local_md)
    cld = keyed_sections(cloud_md)
    bas = keyed_sections(base_md) if base_md else {}

    changed, conflicts, cloud_only, local_only, local_newer = [], [], [], [], []
    for k, (h, cb) in cld.items():
        if k == "_head":
            continue
        if k not in loc:
            cloud_only.append(h)
            continue
        lh, lb = loc[k]
        n_l, n_c = normalize(lb), normalize(cb)
        if n_l == n_c:
            continue
        n_b = normalize(bas[k][1]) if k in bas else None
        if n_b is not None and n_l != n_b and n_c == n_b:
            local_newer.append(lh)            # 只有本地改了：保留本地，云端是旧的
            continue
        if n_b is not None and n_l != n_b and n_c != n_b:
            conflicts.append((lh, cb))        # 两边都改：冲突，禁自动写
            continue
        # 云端改了（或无基线的预览模式）
        if fragile(lb):
            conflicts.append((lh, cb))        # 正本保护：高危成分章节只报不写
        else:
            changed.append((lh, cb))
    for k, (h, _) in loc.items():
        if k != "_head" and k not in cld:
            local_only.append(h)

    print(f"[2/3] 三方 diff（基线={'有' if base_md else '无·仅预览'}）：可回写 {len(changed)} 节"
          f" / 冲突或高危只报不写 {len(conflicts)} 节 / 本地更新保留 {len(local_newer)} 节"
          f" / 云端独有 {len(cloud_only)} / 本地独有 {len(local_only)}")
    for h in local_newer:
        print(f"      🏠 本地比基线新（云端未动）：{h}")
    for h, _ in changed:
        print(f"      ✏️ 云端改了：{h}")
    for h, _ in conflicts:
        print(f"      ⚠️ 高危成分节（正本保护，手工合并）：{h}")
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
        loc_by_head = {h: b for _, (h, b) in loc.items()}
        for lh, cb in changed:
            lb = loc_by_head.get(lh, "")
            old_block = lh + "\n" + lb
            new_block = lh + "\n" + cb.strip("\n")
            if old_block in new_md:
                new_md = new_md.replace(old_block, new_block, 1)
                applied += 1
            else:
                print(f"      ⚠️ 定位失败（跳过）：{lh}")
        bak = md_path.with_suffix(md_path.suffix + ".bak")
        bak.write_text(local_md, encoding="utf-8")            # 回写前快照
        tmp = md_path.with_suffix(md_path.suffix + ".tmp")
        tmp.write_text(new_md, encoding="utf-8")
        os.replace(tmp, md_path)                              # 原子替换
        back = md_path.read_text(encoding="utf-8")
        print(f"[3/3] 回写 {applied}/{len(changed)} 节（.bak 已留）读回 {len(back)} 字")
        if applied != len(changed):
            print(f"      ⛔ 部分回写失败（{applied}/{len(changed)}），退出码 3——先人工核对 .bak")
            return 3
    # 刷新登记块数，让下次 push 人改保护对上账
    if reg:
        cur = count_blocks(doc_id)
        if cur.get("error"):
            print("      ⚠️ API 不可用，跳过登记刷新")
            return 0
        reg["blocks"] = cur.get("total")
        status["cloud_docs"][key] = reg
        status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"      cloud_docs.blocks 已刷新为 {reg['blocks']}（人改保护基线对齐）")
    return 0


def selftest() -> int:
    """离线自测（进 regression --fast）：三方判定/同名标题复合键/往返噪音归一。"""
    # 1) 噪音归一：表格分隔行/链接/围栏语言/强调 都不算差异
    a = "|x|y|\n|---|---|\n[文字](http://u)\n```python\n1\n```\n**粗**"
    b = "| x | y |\n| --- | --- |\n文字\n```\n1\n```\n粗"
    assert normalize(a) == normalize(b), "噪音归一失败"
    # 2) 同名标题不互覆
    md = "## A\n### 口径\nx\n## B\n### 口径\ny\n"
    ks = keyed_sections(md)
    assert sum(1 for k in ks if k.endswith("/口径") or "#" in k) >= 2, f"同名标题被覆: {list(ks)}"
    # 3) 三方判定语义（本地新改保留 / 云端改可收 / 双改冲突）
    base, localv, cloud = "旧内容", "本地新改", "旧内容"
    assert normalize(localv) != normalize(base) and normalize(cloud) == normalize(base)  # → local_newer
    cloud2 = "云端新改"
    assert normalize(cloud2) != normalize(base) and normalize(localv) != normalize(base)  # → conflict
    # 4) fragile 守卫
    assert fragile("|a|b|") and fragile("[x](y)") and fragile("```") and not fragile("纯文本")
    print("prd_pull selftest: 4/4 ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
