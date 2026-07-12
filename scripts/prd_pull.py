#!/usr/bin/env python3
"""云端 PRD → 本地 md 的内容层回收（合并计划波1 · N1 人改回收/同步命令）。

用法：
    python3 scripts/prd_pull.py --md <PRD.md> --project <项目目录> [--doc-id <token>] [--apply]

语义（往返保真边界，v2.0 §波1；二轮复验 §四重构：算法与 IO 分离）：
- **本地 md 永远是源**（含云增强标记层：<红>/<灰>/==核心==/callout/fold）。
- 云端手改只在**内容层**回收：plan_merge(基线, 本地, 云端) 纯三方判定 →
  apply_merge_plan 按复合键+行号 span 回写（不再 str.replace 猜位置）。
- 复合键 = 父级标题链/自身标题，**全程不退回裸标题**（同名标题曾互覆丢节）。
- 基线缺该节而双侧内容不同 = 冲突（双侧独立新增分不清方向，禁自动写）。
- 含标记/图/表/链接/代码的章节（fragile）永不自动回写，列「需手工合并」。
- 云端改动**全部收干净**（零冲突/零独有/零定位失败）才刷新 blocks+content_hash 登记；
  其上再要求零 local_newer 才推进 _cloud/baseline/（基线=双方最后一致状态，
  把本地未推内容写进基线会让下一轮把旧云端拉回来覆盖新本地）。
- 不带 --apply = 只出 diff 报告（预览模式，默认）；无基线禁 --apply。
隐私：同 prd_publish——入口零内部域名，实现依赖本机 xfchat-wiki 插件（--selftest 离线可跑）。
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
sys.path.insert(0, str(REPO / "scripts"))
from _prd_common import (  # noqa: E402
    IMG_RE, MARKER_RE, CALLOUT_RE, FOLD_RE, LINK_RE, TABLE_SEP_RE, content_fingerprint,
)


def normalize(text: str) -> str:
    """内容层归一：剥标记/图占位/callout/fold + **渲染往返噪音**（表格分隔行、链接 URL、
    代码围栏语言、\\| 转义、粗斜删标记）——blocks_to_markdown 是有损渲染，这些差异不是"云端改了"。"""
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


def head_key(h: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"^#+\s*", "", h))


def keyed_records(md: str) -> list[dict]:
    """有序章节记录：{key, head, body, body_start, body_end}（行号 span，回写按位置切片）。
    key=父级标题链/自身标题的复合键；同链同名追加 #2。代码围栏内的 # 不当标题。"""
    lines = md.split("\n")
    recs, stack, seen = [], [], set()

    def close(rec, end):
        rec["body_end"] = end
        rec["body"] = "\n".join(lines[rec["body_start"]:end])
        recs.append(rec)

    cur = {"key": "_head", "head": None, "body_start": 0}
    in_code = False
    for i, ln in enumerate(lines):
        if ln.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = re.match(r"^(#{1,6}) ", ln)
        if not m:
            continue
        close(cur, i)
        level = len(m.group(1))
        name = head_key(ln)
        while stack and stack[-1][0] >= level:
            stack.pop()
        key = "/".join(k for _, k in stack) + "/" + name
        stack.append((level, name))
        base, n = key, 1
        while key in seen:  # 同链同名兜底
            n += 1
            key = f"{base}#{n}"
        seen.add(key)
        cur = {"key": key, "head": ln.strip(), "body_start": i + 1}
    close(cur, len(lines))
    return recs


def keyed_sections(md: str) -> dict:
    return {r["key"]: (r["head"] or "_head", r["body"]) for r in keyed_records(md)}


def plan_merge(base_md, local_md: str, cloud_md: str) -> dict:
    """纯三方合并计划（无 IO；二轮复验 4.5）。每一项全程携带复合键。"""
    loc, cld = keyed_sections(local_md), keyed_sections(cloud_md)
    bas = keyed_sections(base_md) if base_md is not None else None
    plan = {"changed": [], "conflicts": [], "local_newer": [], "cloud_only": [], "local_only": []}
    for k, (h, cb) in cld.items():
        if k == "_head":
            continue
        if k not in loc:
            plan["cloud_only"].append((k, h))
            continue
        lh, lb = loc[k]
        n_l, n_c = normalize(lb), normalize(cb)
        if n_l == n_c:
            continue
        if bas is None:
            plan["conflicts"].append((k, lh, "无基线，方向不可判（仅预览）"))
            continue
        if k not in bas:
            plan["conflicts"].append((k, lh, "基线缺该节且双侧内容不同（双侧独立新增？）方向不可判"))
            continue
        n_b = normalize(bas[k][1])
        if n_l != n_b and n_c == n_b:
            plan["local_newer"].append((k, lh))       # 只有本地改了：保留本地，云端是旧的
            continue
        if n_l != n_b and n_c != n_b:
            plan["conflicts"].append((k, lh, "双侧都改"))
            continue
        # n_l == n_b 且 n_c != n_b → 云端改了
        if fragile(lb) or fragile(cb):
            plan["conflicts"].append((k, lh, "高危成分（标记/图/表/链接/代码），正本保护"))
        else:
            plan["changed"].append((k, lh, cb))
    for k, (h, _) in loc.items():
        if k != "_head" and k not in cld:
            plan["local_only"].append((k, h))
    return plan


def apply_merge_plan(local_md: str, changed: list) -> tuple[str, int, list]:
    """按复合键 + 行号 span 回写（二轮复验 4.1：不再压回裸标题、不再 str.replace 猜位置）。
    返回 (new_md, applied, failed_heads)；保留原节首尾空行节奏。"""
    recs = {r["key"]: r for r in keyed_records(local_md)}
    lines = local_md.split("\n")
    items, failed = [], []
    for k, lh, cb in changed:
        r = recs.get(k)
        if r is None:
            failed.append(lh)
            continue
        items.append((r["body_start"], r["body_end"], cb))
    for start, end, cb in sorted(items, key=lambda x: -x[0]):  # 自底向上，span 不互扰
        orig = lines[start:end]
        lead = 0
        while lead < len(orig) and orig[lead] == "":
            lead += 1
        trail = 0
        if lead < len(orig):  # 全空行的节不再叠首尾
            while trail < len(orig) and orig[-1 - trail] == "":
                trail += 1
        lines[start:end] = [""] * lead + cb.strip("\n").split("\n") + [""] * trail
    return "\n".join(lines), len(items), failed


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

    # 插件延迟导入：--selftest 离线可跑（fresh clone 回归不因缺插件红）
    try:
        from feishu_doc import blocks_to_markdown, count_blocks, get_doc_raw_content, DocApiError  # noqa: E402
    except ImportError:
        sys.exit(
            "❌ 本命令依赖本机私有插件 xfchat-wiki（gitignore 不随仓分发）。\n"
            "   fresh clone 用户无法使用云文档同步——设计如此（云文档域=私有部署）。"
        )

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
    # 三方基线：没有基线不做自动回写——两方 diff 分不清"云端改了"和"本地新改了"
    base_path = project / "_cloud" / "baseline" / key
    base_md = base_path.read_text(encoding="utf-8") if base_path.exists() else None
    if a.apply and base_md is None:
        sys.exit("❌ 无发布基线（_cloud/baseline/，由 prd_publish v2 落）——两方 diff 无法判改动方向，"
                 "禁用 --apply；先预览人工合并，或重新 publish 建基线")

    plan = plan_merge(base_md, local_md, cloud_md)
    changed, conflicts = plan["changed"], plan["conflicts"]
    print(f"[2/3] 三方 diff（基线={'有' if base_md else '无·仅预览'}）：可回写 {len(changed)} 节"
          f" / 冲突或高危只报不写 {len(conflicts)} 节 / 本地更新保留 {len(plan['local_newer'])} 节"
          f" / 云端独有 {len(plan['cloud_only'])} / 本地独有 {len(plan['local_only'])}")
    for _, h in plan["local_newer"]:
        print(f"      🏠 本地比基线新（云端未动）：{h}")
    for _, h, _cb in changed:
        print(f"      ✏️ 云端改了：{h}")
    for _, h, why in conflicts:
        print(f"      ⚠️ 只报不写（{why}）：{h}")
    for _, h in plan["cloud_only"]:
        print(f"      ➕ 云端新增章节（本地没有，需手工决定去留）：{h}")
    for _, h in plan["local_only"]:
        print(f"      ➖ 本地独有章节（云端已删或未推）：{h}")

    if not a.apply:
        print("[3/3] 预览模式结束（--apply 执行回写；冲突/高危节永远不自动回写）")
        return 0

    applied, failed_locs = 0, []
    if not changed:
        print("[3/3] 无可自动回写的章节；冲突节请手工合并")
    else:
        new_md, applied, failed_locs = apply_merge_plan(local_md, changed)
        for h in failed_locs:
            print(f"      ⚠️ 定位失败（跳过）：{h}")
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

    # 登记刷新与基线推进（二轮复验 4.3）：云端改动收干净才动，未决冲突时保护保持武装
    cloud_recovered = not conflicts and not plan["cloud_only"] and not plan["local_only"] and not failed_locs
    if not cloud_recovered:
        n_open = len(conflicts) + len(plan["cloud_only"]) + len(plan["local_only"])
        print(f"      🛡 尚有 {n_open} 处未决（冲突/独有节）——不刷新登记、不推进基线，"
              f"下次 push 的人改保护继续拦（防止未回收的云端内容被 clear 重推冲掉）")
        return 0
    if reg:
        cur = count_blocks(doc_id)
        if cur.get("error"):
            print("      ⚠️ API 不可用，跳过登记刷新（旧登记保留，下次 push 可能要求先 pull——如实）")
            return 0
        reg["blocks"] = cur.get("total")
        try:
            reg["content_hash"] = content_fingerprint(get_doc_raw_content(doc_id))
            hash_note = "hash 已刷新"
        except DocApiError as e:
            reg.pop("content_hash", None)   # 拿不到就摘掉，退化为块数保护——绝不留旧 hash 制造假警报
            hash_note = f"hash 获取失败已摘除（{str(e)[:50]}），退化块数保护"
        status["cloud_docs"][key] = reg
        status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"      cloud_docs 登记已刷新：blocks={reg['blocks']}，{hash_note}")
    if plan["local_newer"]:
        print(f"      🛡 本地有 {len(plan['local_newer'])} 节比基线新（未推云端）——基线不推进"
              f"（推进会让下一轮把旧云端拉回来盖掉新本地），push 定稿后由 publish 重建基线")
    elif base_md is not None:
        merged = md_path.read_text(encoding="utf-8")
        base_path.write_text(merged, encoding="utf-8")
        print("      基线已推进（=本轮同步后的本地全文，双方最后一致状态）")
    return 0


def selftest() -> int:
    """离线自测（进 regression --fast）：纯三方算法 + 复合键回写端到端（Codex 二轮 4.6 十用例）。"""
    # 0) 噪音归一 + fragile 守卫（一轮保留）
    a = "|x|y|\n|---|---|\n[文字](http://u)\n```python\n1\n```\n**粗**"
    b = "| x | y |\n| --- | --- |\n文字\n```\n1\n```\n粗"
    assert normalize(a) == normalize(b), "噪音归一失败"
    assert fragile("|a|b|") and fragile("[x](y)") and fragile("```") and not fragile("纯文本")

    BASE = "# T\n\n## A\n\n旧A\n\n## B\n\n旧B\n"

    def cats(p):
        return {c: len(p[c]) for c in ("changed", "conflicts", "local_newer", "cloud_only", "local_only")}

    zero = {"changed": 0, "conflicts": 0, "local_newer": 0, "cloud_only": 0, "local_only": 0}
    # 1) 仅本地改 → local_newer（保留本地）
    p = plan_merge(BASE, BASE.replace("旧A", "本地A"), BASE)
    assert cats(p) == {**zero, "local_newer": 1}, cats(p)
    # 2) 仅云端改 → changed（可回收）
    p = plan_merge(BASE, BASE, BASE.replace("旧A", "云A"))
    assert cats(p) == {**zero, "changed": 1}, cats(p)
    # 3) 双侧同改同内容 → 无动作
    p = plan_merge(BASE, BASE.replace("旧A", "同改"), BASE.replace("旧A", "同改"))
    assert cats(p) == zero, cats(p)
    # 4) 双侧改不同 → 冲突
    p = plan_merge(BASE, BASE.replace("旧A", "本地A"), BASE.replace("旧A", "云A"))
    assert cats(p) == {**zero, "conflicts": 1}, cats(p)
    # 5) 基线缺节 + 双侧新增同名不同内容 → 冲突（曾被判 changed 自动覆写本地，二轮复验 4.2）
    p = plan_merge(BASE, BASE + "\n## 新节\n\n本地新增\n", BASE + "\n## 新节\n\n云端新增\n")
    assert cats(p) == {**zero, "conflicts": 1}, cats(p)
    # 6) 不同父级同名标题只改其一：复合键直达 + 端到端回写不串节（二轮复验 4.1 反例）
    md6 = "# T\n\n## A\n\n### 口径\n\nA-local\n\n## B\n\n### 口径\n\nB-local\n"
    cl6 = md6.replace("A-local", "A-cloud")
    p = plan_merge(md6, md6, cl6)
    assert len(p["changed"]) == 1 and p["changed"][0][0] == "T/A/口径", p["changed"]
    new_md, applied, failed = apply_merge_plan(md6, p["changed"])
    assert applied == 1 and not failed
    assert "A-cloud" in new_md and "B-local" in new_md and "A-local" not in new_md, new_md
    # 7) 同链同名标题 → #2 后缀不互覆
    ks = keyed_sections("## A\nx\n## A\ny\n")
    assert len([k for k in ks if k != "_head"]) == 2, list(ks)
    # 8) fragile 节（云端改了表格）→ 冲突不自动写
    md8 = "# T\n\n## 表\n\n|a|b|\n|---|---|\n|1|2|\n"
    p = plan_merge(md8, md8, md8.replace("|1|2|", "|1|9|"))
    assert cats(p) == {**zero, "conflicts": 1}, cats(p)
    # 9) 定位失败（伪 key）→ failed 显式报出，不静默吞
    _, applied, failed = apply_merge_plan(md6, [("不存在/键", "## 假", "x")])
    assert applied == 0 and len(failed) == 1
    # 10) 一轮同步推进基线后，第二轮仅本地改 → local_newer（不产生假冲突，二轮复验 4.6-10）
    merged = BASE.replace("旧A", "云A")
    p = plan_merge(merged, merged.replace("旧B", "本地B2"), merged)
    assert cats(p) == {**zero, "local_newer": 1}, cats(p)
    # 11) 代码围栏里的 "# 注释" 不当标题切节（防把 fragile 节切出可写子节）
    md11 = "## 代码\n```bash\n# 注释\n```\n"
    assert [k for k in keyed_sections(md11) if k != "_head"] == ["/代码"], list(keyed_sections(md11))
    print("prd_pull selftest: 12/12 ok（纯三方算法 + 复合键回写端到端，含二轮十反例）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
