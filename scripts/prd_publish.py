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

_PLUGIN_ERR = None
if os.environ.get("AIPM_DISABLE_PRIVATE_PLUGIN"):
    # fresh-clone 模拟开关（四轮复验 §六验收）：无插件环境 selftest 必须过、普通命令明确报缺
    _PLUGIN_ERR = ImportError("private plugin disabled via AIPM_DISABLE_PRIVATE_PLUGIN=1")
else:
    try:
        from feishu_doc import (  # noqa: E402
            create_doc, push_markdown_to_doc, count_blocks, find_blocks_by_type,
            count_legacy_prototype_rows, get_doc_outline, get_doc_raw_content,
            blocks_to_markdown, get_doc_meta, DocApiError,
        )
        from feishu_other import search_docs, delete_file  # noqa: E402
    except ImportError as _e:  # 拒绝延迟到 main——--selftest 注入假件离线可跑（三轮复验 §2.5）
        _PLUGIN_ERR = _e

sys.path.insert(0, str(REPO / "scripts"))
from _prd_common import (  # noqa: E402
    IMG_RE, TABLE_SEP_RE, content_fingerprint, count_headings_for_push,
    delete_verdict, find_residues, find_token_by_title,
)
# 采纳流程复用 pull 的三方归一口径 + 一致性括号 + fragile 判定（单源）
from prd_pull import plan_merge, keyed_sections, fragile, read_cloud_snapshot, CloudReadRace  # noqa: E402


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
    return {
        "images": len(IMG_RE.findall(md)),
        "tables": tables,
        "legacy_rows": count_legacy_prototype_rows(md),
        # render-manifest（发布时生成预期指纹，读回逐项对账——Codex 答问 1 方案）
        "headings": count_headings_for_push(md),
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
    ap.add_argument("--project", help="项目目录（含 _status.json）——除 --selftest 外必填")
    ap.add_argument("--doc-id")
    ap.add_argument("--image-dir")
    ap.add_argument("--title")
    ap.add_argument("--force", action="store_true", help="跳过云端人改保护")
    ap.add_argument("--cleanup", action="store_true",
                    help="清尾 gate：盘点本项目云端旧档/空壳/坏档/同名孤儿，出清单（不自动删）")
    ap.add_argument("--delete-doc", help="删除指定 doc token（配 --yes 才执行；先跑 --cleanup 看清单）")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--adopt-current-cloud", action="store_true", dest="adopt",
                    help="安全采纳云端现状为保护基线：内容层零差异才补 hash/blocks/baseline"
                         "（存量登记武装用；有差异只出预览不写）")
    ap.add_argument("--accept-lossy-adopt", action="store_true", dest="accept_lossy",
                    help="人工确认有损章节（链接URL/图片身份/表结构）与云端一致后放行 adopt"
                         "（登记落审计字段；默认这些节机器不可确认、阻断）")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if _PLUGIN_ERR is not None:
        if os.environ.get("AIPM_DISABLE_PRIVATE_PLUGIN"):
            sys.exit("❌ AIPM_DISABLE_PRIVATE_PLUGIN=1 已禁用私有插件（fresh-clone 模拟）"
                     "——跑真实命令请去掉该环境变量。")
        if XFCHAT.exists():
            sys.exit(f"❌ xfchat-wiki 插件在但导入失败（多半是插件版本旧、缺新函数）：{_PLUGIN_ERR}\n"
                     f"   先更新 {XFCHAT} 所在 nested 仓再重试——这不是'设计如此'，是版本错配。")
        sys.exit(
            "❌ 本命令依赖本机私有插件 xfchat-wiki（.claude/skills/xfchat-wiki/，gitignore 不随仓分发）。\n"
            "   fresh clone 用户无法使用云文档推送——这是设计如此（云文档域=私有部署），不是安装缺陷。"
        )
    if not a.project:
        sys.exit("❌ 需要 --project（或 --selftest）")

    project = Path(a.project).resolve()

    if a.delete_doc:
        bc0 = count_blocks(a.delete_doc)
        if bc0.get("error"):
            print(f"⛔ API 不可用（{bc0['error'][:80]}）——无法确认目标状态，中止删除。")
            return 2
        total0 = bc0.get("total")
        if not a.yes:
            print(f"预览：将删除云文档 {a.delete_doc[:16]}…（当前 blocks={total0}）——确认请加 --yes")
            return 0
        r = delete_file(a.delete_doc, "docx")
        print(f"删除响应：{json.dumps(r, ensure_ascii=False)[:200]}")
        back = count_blocks(a.delete_doc)
        # fail-closed 判定（二轮复验 §三）：读回报错≠删除成功——权限/限流/网络都长这样
        verdict, reason = delete_verdict(r, back)
        icon = {"ok": "✓ 已删除", "unknown": "⚠️ 删除结果未知", "fail": "⛔ 删除失败"}[verdict]
        print(f"读回验证：{icon} —— {reason}")
        if verdict == "unknown":
            print("      不当成功处理；API 恢复后重跑 --delete-doc 或人工到回收站确认")
        return 0 if verdict == "ok" else 2

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
            if bc2.get("error"):
                print(f"  ⚠️ API 不可用（{key2}）：{bc2['error'][:60]}——非坏档判定，恢复后重盘")
                continue
            total = bc2.get("total")
            if not total:
                print(f"  💀 坏档/空档（0 块）：{key2} → {tok[:16]}…（建议 --delete-doc 或修登记）")
                continue
            flag = "🫙 空壳（≤1 块，疑似清空残留）" if total <= 1 else "✓"
            print(f"  {flag} {key2} blocks={total}")
            # 同名孤儿：按 PRD 文件名（去 .md）精确搜（共享助手 _prd_common）
            title = re.sub(r"\.md$", "", key2)
            orphan = find_token_by_title(title, search_docs)
            if orphan and orphan != tok and orphan not in seen_tokens:
                print(f"      👻 同名孤儿候选：「{title}」 {orphan[:16]}…（不在登记，人工确认后 --delete-doc）")
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

    if a.adopt:
        # 存量登记武装（三轮 §2.4 + 四轮 §四/§五）：一致性括号读全齐 → 内容层零差异
        # → 有损章节可确认，三关都过才补基线；任一不过只出预览
        if not doc_id:
            sys.exit("❌ --adopt-current-cloud 需要已有登记 doc_token 或 --doc-id")
        try:
            cloud_md, raw0, blocks0, rev0 = read_cloud_snapshot(
                doc_id, blocks_to_markdown, count_blocks, get_doc_raw_content, get_doc_meta)
        except CloudReadRace as e:
            print(f"⛔ {e}")
            return 2
        except Exception as e:
            print(f"⛔ 云端读取失败（{e}）——采纳需要云端事实齐备（markdown/blocks/raw），恢复后重试。")
            return 2
        plan = plan_merge(None, md, cloud_md)
        open_items = ([(h, why) for _k, h, why in plan["conflicts"]]
                      + [(h, "云端独有") for _k, h in plan["cloud_only"]]
                      + [(h, "本地独有") for _k, h in plan["local_only"]])
        if open_items:
            print(f"⛔ 本地与云端内容层有 {len(open_items)} 处差异——不能盲采纳为基线：")
            for h, why in open_items[:20]:
                print(f"   - {h}（{why}）")
            print("   先 prd_pull 预览人工合并到零差异；或确认放弃云端改动后直接 --force push。")
            return 2
        # 有损盲区（四轮复验 §四）：normalize 抹掉链接 URL/图片身份/表结构/围栏语言——
        # 归一化相等证明不了这些内容一致，匹配节任一侧 fragile=机器不可确认，默认阻断
        loc_s, cld_s = keyed_sections(md), keyed_sections(cloud_md)
        lossy = [loc_s[k][0] for k in loc_s
                 if k in cld_s and (fragile(loc_s[k][1]) or fragile(cld_s[k][1]))]
        if lossy and not a.accept_lossy:
            print(f"⛔ {len(lossy)} 个章节含有损内容——归一化相等证明不了链接 URL/图片身份/"
                  f"表结构一致，机器无法确认：")
            for h in lossy[:20]:
                print(f"   - {h}")
            print("   人工比对云端确认一致后，加 --accept-lossy-adopt 重跑（登记留审计字段）。")
            return 2
        now0 = datetime.now().strftime("%Y-%m-%d %H:%M")
        reg.update({"doc_token": doc_id, "blocks": blocks0,
                    "content_hash": content_fingerprint(raw0), "adopted_at": now0})
        if rev0 is not None:
            reg["revision_id"] = rev0
        if lossy:
            reg["adopt_lossy"] = {"accepted_at": now0, "sections": lossy[:50],
                                  "unverified": "链接URL/图片身份/表结构/围栏语言/格式层"}
        bl_dir0 = project / "_cloud" / "baseline"
        bl_dir0.mkdir(parents=True, exist_ok=True)
        (bl_dir0 / key).write_text(md, encoding="utf-8")
        cloud[key] = reg
        status["cloud_docs"] = cloud
        status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        back0 = json.loads(status_path.read_text(encoding="utf-8"))
        ok0 = bool(back0.get("cloud_docs", {}).get(key, {}).get("content_hash"))
        print("✅ 已采纳云端现状为保护基线（内容层零差异）：hash+blocks+baseline 补齐" if ok0
              else "⛔ 登记读回失败")
        return 0 if ok0 else 2

    if doc_id:
        # 人改保护 v4（三轮复验 §二）：登记缺 hash **或**缺 blocks = 无完整基线——push 是
        # 覆盖式（clear_first 先清空云端），缺基线时无法证明云端没有人改，默认阻断。
        # "第一次覆盖后补保护"不是迁移方案：第一次覆盖正是最需要保护的一次。
        if not a.force and (not reg.get("content_hash") or not reg.get("blocks")):
            print("[2/5] ⛔ 旧登记缺完整保护基线（hash/blocks 不全）——禁止覆盖式 push。")
            print("      安全路径：--adopt-current-cloud 先采纳云端现状补齐基线；"
                  "确认放弃云端改动才 --force（=显式放弃保护）。")
            return 2
        cur = count_blocks(doc_id)
        if cur.get("error"):
            print(f"[2/5] ⛔ 云端 API 不可用（{cur['error'][:80]}）——先别推，恢复后重试（失败≠空文档）。")
            return 2
        if not a.force:
            hits = []
            try:
                now_hash = content_fingerprint(get_doc_raw_content(doc_id))
            except DocApiError as e:
                print(f"[2/5] ⛔ 云端正文读取失败（{e}）——hash 无法核对，fail closed。"
                      f"恢复后重试，或确认放弃云端改动后 --force。")
                return 2
            if now_hash != reg["content_hash"]:
                hits.append("正文 hash 与上次发布不一致")
            if cur.get("total") != reg["blocks"]:
                hits.append(f"块数 {cur.get('total')} ≠ 登记 {reg['blocks']}")
            if hits:
                print(f"[2/5] ⛔ 云端疑似有人改：{'；'.join(hits)}")
                print("      先 prd_pull 回收人改，或确认无价值改动后 --force 重推。")
                return 2
        via_str = "跳过 --force（用户显式放弃人改保护）" if a.force else "通过[hash+块数]"
        print(f"[2/5] 目标文档 {doc_id[:16]}…（人改保护：{via_str}）")
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
    if bc.get("error"):
        print(f"[4/5] ⛔ 读回失败（API：{bc['error'][:80]}）——push 结果未验证，禁止视为发布成功。")
        return 2
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
    try:
        raw = get_doc_raw_content(doc_id)  # 同一份 raw 供残留检查 + hash 登记；失败即发布未验证
    except DocApiError as e:
        print(f"[4/5] ⛔ 云端正文读取失败（{e}）——残留检查与 hash 登记无法完成，"
              f"push 结果未验证，禁止视为发布成功；恢复后重跑本命令。")
        return 2
    residues = find_residues(md, raw)
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
    # 三方合并基线：①云端正文指纹进登记（[4/5] 已读回的同一份 raw，必有）②本地源快照落 _cloud/baseline/
    entry["content_hash"] = content_fingerprint(raw)
    bl_dir = project / "_cloud" / "baseline"
    bl_dir.mkdir(parents=True, exist_ok=True)
    (bl_dir / key).write_text(md, encoding="utf-8")
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


def selftest() -> int:
    """离线自测（进 --fast；三轮复验 §2.5 矩阵）：存量登记缺保护基线必须默认阻断，
    且用 sentinel 断言破坏性 push **没有被调用**——不是只看退出码。"""
    import tempfile

    class _PushReached(Exception):
        pass

    class _FakeApiErr(RuntimeError):
        pass

    g = globals()
    keys = ("count_blocks", "push_markdown_to_doc", "get_doc_raw_content",
            "DocApiError", "count_legacy_prototype_rows", "blocks_to_markdown", "get_doc_meta")
    saved = {k: g[k] for k in keys if k in g}
    missing = [k for k in keys if k not in g]      # fresh clone 下这些全局本不存在，事后要删干净
    saved_err = g.get("_PLUGIN_ERR")
    g["_PLUGIN_ERR"] = None                        # selftest 递归 main 不得被插件门拦（四轮 §六）

    def _run(reg, force=False):
        with tempfile.TemporaryDirectory() as td:
            proj = Path(td) / "proj"
            proj.mkdir()
            mdp = Path(td) / "测试.md"
            mdp.write_text("# 测试\n\n## A\n\n内容\n", encoding="utf-8")
            (proj / "_status.json").write_text(json.dumps(
                {"cloud_docs": {"测试.md": dict(reg, doc_token="doc1")}}, ensure_ascii=False),
                encoding="utf-8")
            argv0 = sys.argv
            sys.argv = (["prd_publish", "--md", str(mdp), "--project", str(proj)]
                        + (["--force"] if force else []))
            try:
                return main(), False
            except _PushReached:
                return None, True
            finally:
                sys.argv = argv0

    g.update(
        count_blocks=lambda d: {"total": 7, "by_type": {}},
        get_doc_raw_content=lambda d, lang=0: "内容",
        push_markdown_to_doc=lambda *a_, **k_: (_ for _ in ()).throw(_PushReached()),
        DocApiError=_FakeApiErr,
        count_legacy_prototype_rows=lambda md_: 0,
        get_doc_meta=lambda d: {"code": 0, "data": {"document": {"revision_id": 3}}},
    )
    try:
        ok_hash = content_fingerprint("内容")
        rc, reached = _run({"content_hash": ok_hash, "blocks": 7})      # a) 基线完整且云端一致 → 放行
        assert reached, "完整基线且一致应放行到 push"
        rc, reached = _run({})                                          # b) hash+blocks 双缺 → 阻断
        assert rc == 2 and not reached, (rc, reached)
        rc, reached = _run({"blocks": 7})                               # c) 只有 blocks → 阻断（护不住同块改字）
        assert rc == 2 and not reached, (rc, reached)
        rc, reached = _run({"content_hash": ok_hash})                   # d) 只有 hash → 阻断（不做隐式降级）
        assert rc == 2 and not reached, (rc, reached)
        rc, reached = _run({}, force=True)                              # e) 双缺 + --force → 放行（显式放弃保护）
        assert reached, "--force 应放行"
        rc, reached = _run({"content_hash": "deadbeef", "blocks": 7})   # f) 基线完整但云端有人改 → 阻断
        assert rc == 2 and not reached, (rc, reached)
        # g/h) --adopt-current-cloud：零差异才补基线（云标题≠本地 H1 不算差异），有差异只预览
        def _adopt(cloud_md, local="# 测试\n\n## A\n\n内容\n", lossy_flag=False, raw="内容"):
            g["blocks_to_markdown"] = lambda d: cloud_md
            g["get_doc_raw_content"] = lambda d, lang=0: raw
            with tempfile.TemporaryDirectory() as td:
                proj = Path(td) / "proj"
                proj.mkdir()
                mdp = Path(td) / "测试.md"
                mdp.write_text(local, encoding="utf-8")
                (proj / "_status.json").write_text(json.dumps(
                    {"cloud_docs": {"测试.md": {"doc_token": "doc1"}}}, ensure_ascii=False),
                    encoding="utf-8")
                argv0 = sys.argv
                sys.argv = (["prd_publish", "--md", str(mdp), "--project", str(proj),
                             "--adopt-current-cloud"] + (["--accept-lossy-adopt"] if lossy_flag else []))
                try:
                    rc_ = main()
                finally:
                    sys.argv = argv0
                back = json.loads((proj / "_status.json").read_text(encoding="utf-8"))["cloud_docs"]["测试.md"]
                return rc_, back, (proj / "_cloud" / "baseline" / "测试.md").exists()
        rc, back, has_base = _adopt("# 云文档标题\n\n## A\n\n内容\n")
        assert rc == 0 and back.get("content_hash") and back.get("blocks") == 7 and has_base, back
        assert back.get("revision_id") == 3, ("adopt 应登记 revision 审计字段", back)
        rc, back, has_base = _adopt("# 云文档标题\n\n## A\n\n云端被人改了\n")
        assert rc == 2 and not back.get("content_hash") and not has_base, back
        # i/j/k) 有损盲区（四轮 §四）：同文字异 URL / 同占位异图——归一化相等≠一致，默认阻断；
        #        显式 --accept-lossy-adopt 才放行并落审计字段
        rc, back, has_base = _adopt("# 云\n\n## A\n\n官网\n",
                                    local="# 测试\n\n## A\n\n[官网](https://local.example)\n")
        assert rc == 2 and not back.get("content_hash") and not has_base, ("链接节应默认阻断", back)
        rc, back, has_base = _adopt("# 云\n\n## A\n\n[图片]\n",
                                    local="# 测试\n\n## A\n\n![](img.png)\n")
        assert rc == 2 and not back.get("content_hash"), ("图片节应默认阻断", back)
        rc, back, has_base = _adopt("# 云\n\n## A\n\n官网\n",
                                    local="# 测试\n\n## A\n\n[官网](https://local.example)\n",
                                    lossy_flag=True)
        assert rc == 0 and back.get("content_hash") and back.get("adopt_lossy", {}).get("sections"), \
            ("显式接受有损后应放行并留审计", back)
    finally:
        g.update(saved)
        for k in missing:
            g.pop(k, None)                         # 别把 fake 留成真全局（fresh clone 环境污染）
        g["_PLUGIN_ERR"] = saved_err
    print("prd_publish selftest: 11/11 ok（守门矩阵+push 未调用+adopt 零差异/有损闸/审计）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
