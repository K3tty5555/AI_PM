#!/usr/bin/env python3
"""PRD 定稿发布一条龙（v2 · 合并计划波1：render-manifest 对账 + 标记残留检查 + 清尾 gate）。

一条命令收口：push 云文档 → 读回校验（防丢图/防假落盘）→ cloud_docs 登记。
用法：
    python3 scripts/prd_publish.py --md <PRD.md> --project <项目目录> \
        [--doc-id <已有doc_id>] [--image-dir <图片目录>] [--title <新建标题>] [--force]

安全线（对齐"先读再增量"纪律）：
- 目标文档已存在且登记过 blocks 数时，push 前读回当前块数比对——不一致视为云端可能有人改，
  中止并提示先做"人改回收"（--force 跳过）。
- 全程读回实测，不信推送回显；任一校验不过退出码 2，禁止视为发布成功。
隐私：不硬编码文档域名——URL 前缀取 AIPM_DOC_HOST 环境变量，或从项目已有 cloud_docs 登记里学。
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
XFCHAT = REPO / ".claude" / "skills" / "xfchat-wiki" / "scripts"
sys.path.insert(0, str(XFCHAT))

try:
    from feishu_doc import (  # noqa: E402
        create_doc, push_markdown_to_doc, count_blocks, find_blocks_by_type,
        count_legacy_prototype_rows, get_doc_outline, get_doc_raw_text, get_doc_meta,
    )
    from feishu_other import search_docs, delete_file  # noqa: E402
except ImportError:
    sys.exit(
        "❌ 本命令依赖本机私有插件 xfchat-wiki（.claude/skills/xfchat-wiki/，gitignore 不随仓分发）。\n"
        "   fresh clone 用户无法使用云文档推送——这是设计如此（云文档域=私有部署），不是安装缺陷。"
    )

IMG_RE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")
TABLE_SEP_RE = re.compile(r"^\s*\|?[\s:-]*-[\s:|-]*$")


def analyze_md(md: str) -> dict:
    lines = md.split("\n")
    tables = 0
    in_code = False
    prev_has_pipe = False
    for ln in lines:
        if ln.strip().startswith("```"):
            in_code = not in_code
            prev_has_pipe = False
            continue
        if in_code:
            continue
        if TABLE_SEP_RE.match(ln) and "|" in ln and prev_has_pipe:
            tables += 1
        prev_has_pipe = "|" in ln
    headings = [ln.strip() for ln in lines if re.match(r"^#{1,3} ", ln)]
    return {
        "images": len(IMG_RE.findall(md)),
        "tables": tables,
        "legacy_rows": count_legacy_prototype_rows(md),
        # render-manifest（发布时生成预期指纹，读回逐项对账——Codex 答问 1 方案）
        "headings": len(headings),
        "callouts": len(re.findall(r"^> \[!(?:TIP|WARNING|NOTE)\]", md, re.M)),
        "marker_red": md.count("<红>"),
        "marker_gray": md.count("<灰>"),
        "marker_core": len(re.findall(r"==[^=\n]+==", md)),
    }


def load_status(project: Path) -> tuple[dict, Path]:
    p = project / "_status.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8")), p
    return {}, p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", help="PRD 文件（push 模式必填）")
    ap.add_argument("--project", required=True, help="项目目录（含 _status.json）")
    ap.add_argument("--doc-id")
    ap.add_argument("--image-dir")
    ap.add_argument("--title")
    ap.add_argument("--force", action="store_true", help="跳过云端人改保护")
    ap.add_argument("--cleanup", action="store_true",
                    help="清尾 gate：盘点本项目云端旧档/空壳/坏档/同名孤儿，出清单（不自动删）")
    ap.add_argument("--delete-doc", help="删除指定 doc token（配 --yes 才执行；先跑 --cleanup 看清单）")
    ap.add_argument("--yes", action="store_true")
    a = ap.parse_args()

    project = Path(a.project).resolve()

    if a.delete_doc:
        bc0 = count_blocks(a.delete_doc)
        total0 = bc0.get("total")
        if not a.yes:
            print(f"预览：将删除云文档 {a.delete_doc[:16]}…（当前 blocks={total0}）——确认请加 --yes")
            return 0
        r = delete_file(a.delete_doc, "docx")
        print(f"删除结果：{json.dumps(r, ensure_ascii=False)[:200]}")
        back = count_blocks(a.delete_doc)
        gone = not back.get("total")
        print("读回验证：" + ("✓ 已不可访问" if gone else f"⛔ 仍可读到 {back.get('total')} 块，删除未生效"))
        return 0 if gone else 2

    if a.cleanup:
        status, _ = load_status(project)
        cloud = status.get("cloud_docs") or {}
        if not cloud:
            print("本项目无 cloud_docs 登记，无尾可清")
            return 0
        print(f"清尾盘点（{len(cloud)} 条登记）：")
        seen_tokens = set()
        for key2, reg2 in cloud.items():
            tok = reg2.get("doc_token")
            seen_tokens.add(tok)
            bc2 = count_blocks(tok)
            total = bc2.get("total")
            if not total:
                print(f"  💀 坏档（读不到任何块）：{key2} → {tok[:16]}…（建议 --delete-doc 或修登记）")
                continue
            flag = "🫙 空壳（≤1 块，疑似清空残留）" if total <= 1 else "✓"
            print(f"  {flag} {key2} blocks={total}")
            # 同名孤儿：按 PRD 文件名（去 .md）搜，token 不在登记里的
            title = re.sub(r"\.md$", "", key2)
            try:
                hits = ((search_docs(title, count=10) or {}).get("data") or {}).get("docs_entities") or []
            except Exception:
                hits = []
            for h in hits:
                htok = h.get("docs_token")
                if htok and htok != tok and htok not in seen_tokens and h.get("title") == title:
                    print(f"      👻 同名孤儿候选：「{h.get('title')}」 {htok[:16]}…（不在登记，人工确认后 --delete-doc）")
        print("清单仅供拍板——删除一律显式 --delete-doc <token> --yes，绝不自动删")
        return 0

    if not a.md:
        sys.exit("❌ push 模式需要 --md（清尾用 --cleanup）")
    md_path = Path(a.md).resolve()
    md = md_path.read_text(encoding="utf-8")
    image_dir = a.image_dir or str(md_path.parent)
    key = md_path.name

    src = analyze_md(md)
    print(f"[1/5] 源体检：图 {src['images']} / 表 {src['tables']} / legacy 原型占位 {src['legacy_rows']}")
    if src["legacy_rows"]:
        print("      ⚠️ 源仍有旧 [xxx原型] 占位——建议先跑源侧校验器改写为四态协议再发布")

    status, status_path = load_status(project)
    cloud = status.get("cloud_docs") or {}
    reg = cloud.get(key) or {}
    doc_id = a.doc_id or reg.get("doc_token")

    if doc_id:
        # 人改保护：登记过块数则比对当前云端块数
        cur = count_blocks(doc_id)
        if reg.get("blocks") and cur.get("total") != reg["blocks"] and not a.force:
            print(f"[2/5] ⛔ 云端块数 {cur.get('total')} ≠ 上次登记 {reg['blocks']}：疑似有人改。")
            print("      先做人改回收（diff 云端→本地），或确认无价值改动后 --force 重推。")
            return 2
        print(f"[2/5] 目标文档 {doc_id[:16]}…（人改保护：{'跳过 --force' if a.force else '通过'}）")
    else:
        title = a.title or re.sub(r"\.md$", "", key)
        r = create_doc(title)
        doc_id = r.get("document_id")
        if not doc_id:
            print(f"[2/5] ⛔ 建文档失败：{json.dumps(r, ensure_ascii=False)[:200]}")
            return 2
        print(f"[2/5] 新建文档 {doc_id}")

    body = md
    first = body.split("\n", 1)[0]
    if first.startswith("# "):
        body = body.split("\n", 1)[1].lstrip("\n")  # 标题由文档名承担，避免重复 H1

    res = push_markdown_to_doc(doc_id, body, image_dir=image_dir, clear_first=True)
    if res.get("error"):
        print(f"[3/5] ⛔ push 失败：{res['error']}")
        return 2
    print(f"[3/5] push 回显：blocks {res.get('created')} / 图 {res.get('images')} / 表 {res.get('tables')}"
          f" / failed_images {len(res.get('failed_images') or [])} / failed_files {len(res.get('failed_files') or [])}")

    # 读回实测（不信回显）
    bc = count_blocks(doc_id)
    imgs = find_blocks_by_type(doc_id, 27)
    empty_imgs = [b for b in imgs if not (b.get("image") or {}).get("token")]
    by_type = {str(k): v for k, v in (bc.get("by_type") or {}).items()}
    cloud_tables = by_type.get("31", 0)
    problems = []
    if len(imgs) != src["images"]:
        problems.append(f"图块数 {len(imgs)} ≠ 源图数 {src['images']}")
    if empty_imgs:
        problems.append(f"{len(empty_imgs)} 个图块 token 为空（丢图）")
    if cloud_tables != src["tables"]:
        problems.append(f"表块数 {cloud_tables} ≠ 源表数 {src['tables']}")
    if res.get("failed_images") or res.get("failed_files"):
        problems.append(f"failed_images/files 非空：{res.get('failed_images')}{res.get('failed_files')}")
    outline = get_doc_outline(doc_id) or []
    if src["headings"] and abs(len(outline) - src["headings"]) > 0:
        problems.append(f"标题块数 {len(outline)} ≠ 源标题数 {src['headings']}（章节丢失/拆并）")
    raw = (get_doc_raw_text(doc_id) or {}).get("content") or ""
    residues = [m for m in ("<红>", "</红>", "<灰>", "</灰>", "[!TIP]", "[!WARNING]") if m in raw]
    if residues:
        problems.append(f"增强标记字面残留（渲染未生效）：{residues}")
    if src["marker_core"] and "==" in raw:
        print("      ⚠️ 云端正文含 '=='——可能是 ==核心== 未渲染，建议目检（不阻断）")
    if problems:
        print("[4/5] ⛔ 读回校验不过：\n      - " + "\n      - ".join(problems))
        return 2
    print(f"[4/5] 读回校验 ✓：blocks {bc.get('total')} / 图 {len(imgs)}(token 全非空) / 表 {cloud_tables}")

    # 登记 cloud_docs
    host = os.environ.get("AIPM_DOC_HOST", "").rstrip("/")
    if not host:
        for v in cloud.values():
            u = v.get("url") or ""
            m = re.match(r"(https://[^/]+)/docx/", u)
            if m:
                host = m.group(1)
                break
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = {
        "doc_token": doc_id,
        "url": f"{host}/docx/{doc_id}" if host else None,
        "pushed_at": now,
        "last_validated": now,
        "blocks": bc.get("total"),
        "images": len(imgs),
        "tables": cloud_tables,
        "manifest": {"headings": src["headings"], "callouts": src["callouts"],
                     "red": src["marker_red"], "gray": src["marker_gray"], "core": src["marker_core"]},
    }
    cloud[key] = {k: v for k, v in entry.items() if v is not None}
    status["cloud_docs"] = cloud
    status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    back = json.loads(status_path.read_text(encoding="utf-8"))
    ok = back.get("cloud_docs", {}).get(key, {}).get("doc_token") == doc_id
    print(f"[5/5] cloud_docs 登记{'✓' if ok else '⛔ 读回不一致'}：{status_path}")
    if not ok:
        return 2
    print(f"\n✅ 发布完成：{entry.get('url') or doc_id}")
    print("   （目标文档若开了「标题自动序号」，源 md 手打序号会叠——见 xfchat-wiki 序号约定）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
