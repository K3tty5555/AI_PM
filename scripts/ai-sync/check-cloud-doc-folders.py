#!/usr/bin/env python3
"""检测 _status.json 里 cloud_docs 登记的云文档「目录漂移」与死链（A 档：默认只读）。

与 check-status-staleness.js 互补：那个查本地相对路径死链，本脚本查**云端**——
  ① 登记的 folder.path 与云盘实际目录是否已经对不上（文档被人挪走）
  ② doc_token 是否已被删除 / 已不在我的云盘树里
  ③ 哪些登记还没有 folder 字段（补齐后才能持续比对）

云盘树通过 xfchat-wiki skill 拉取，**shortcut 会解析到 target_token**——
月份文件夹里大量条目是快捷方式（token 前缀 nodrz），直接按 docx token 匹配会
误报成「文档不在云盘里」（2026-09-14 首次实现时踩过，16 份全误报）。

Usage:
  python3 scripts/ai-sync/check-cloud-doc-folders.py                 # 只读检测
  python3 scripts/ai-sync/check-cloud-doc-folders.py --json          # 机读
  python3 scripts/ai-sync/check-cloud-doc-folders.py --write         # 回写 folder 字段

Exit codes:
  0  全部 clean
  1  参数错误 / 云盘不可达（拿不到树就不判漂移，避免把网络问题报成漂移）
  3  检测到漂移（目录不符 / 死链 / 缺 folder 字段）
"""

import argparse
import datetime
import glob
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(os.path.dirname(__file__))))
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SKILL_SCRIPTS = os.path.join(REPO, ".claude", "skills", "xfchat-wiki", "scripts")
STATUS_GLOBS = ["output/projects/*/_status.json", "output/assets/*/_status.json"]
MAX_DEPTH = 6


def load_drive_tree():
    """遍历云盘全树，返回 {target_token: (folder_path, name, entry_type)}。"""
    if not os.path.isdir(SKILL_SCRIPTS):
        raise RuntimeError(f"找不到 xfchat-wiki skill scripts：{SKILL_SCRIPTS}")
    sys.path.insert(0, SKILL_SCRIPTS)
    from feishu_other import list_files_in_folder, get_root_folder_meta

    def ls(tok):
        out, pt = [], None
        while True:
            r = list_files_in_folder(tok, page_size=200, page_token=pt)
            d = r.get("data", r) or {}
            out += d.get("files", []) or []
            if d.get("has_more") and d.get("next_page_token"):
                pt = d["next_page_token"]
            else:
                return out

    index = {}
    root = get_root_folder_meta().get("data", {}).get("token")
    if not root:
        raise RuntimeError("拿不到云盘 root folder token")

    def walk(tok, path, depth=0):
        if depth > MAX_DEPTH:
            return
        for f in ls(tok):
            name, typ, k = f.get("name"), f.get("type"), f.get("token")
            child = f"{path}/{name}"
            if typ == "folder":
                walk(k, child, depth + 1)
            elif typ == "shortcut":
                tt = (f.get("shortcut_info") or {}).get("target_token")
                if tt:
                    index[tt] = (path, name, "shortcut")
            else:
                index[k] = (path, name, "direct")

    walk(root, "", 0)
    return index


def norm_path(p):
    """归一化目录写法：手写登记常是「需求文档 / 2026年10月」，云端是「/需求文档/2026年10月」。"""
    if not p:
        return ""
    return "/" + p.replace(" ", "").replace("\\", "/").strip("/")


def probe_doc(token):
    """树里找不到时，区分「已删除」和「在别人云盘/知识库里」。"""
    try:
        from feishu_doc import get_doc_meta

        m = get_doc_meta(token)
        if (m.get("msg") or "").lower().find("deleted") >= 0:
            return "deleted", m.get("msg")
        doc = (m.get("data") or {}).get("document") or {}
        if doc:
            return "outside", doc.get("title")
        return "unknown", m.get("msg")
    except Exception as exc:  # 网络/权限问题不当成死链
        return "unreachable", str(exc)


def scan(tree, write=False):
    today = datetime.date.today().isoformat()
    findings = []
    touched = {}
    for pattern in STATUS_GLOBS:
        for path in sorted(glob.glob(os.path.join(REPO, pattern))):
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            docs = data.get("cloud_docs")
            if not docs:
                continue
            changed = False
            for key, entry in docs.items():
                token = entry.get("doc_token")
                if not token:
                    continue
                rel = os.path.relpath(path, REPO)
                actual = tree.get(token)
                if actual is None:
                    state, detail = probe_doc(token)
                    if state == "unreachable":
                        continue
                    # 已经登记过 deleted 的不再红色告警，只留一条静默记录（否则每次跑都刷红）
                    if state == "deleted" and entry.get("cloud_status") == "deleted":
                        state = "deleted_ack"
                    findings.append(
                        {"file": rel, "doc": key, "token": token,
                         "kind": state, "detail": detail}
                    )
                    if write and state == "deleted":
                        entry["cloud_status"] = "deleted"
                        entry["cloud_status_verified"] = today
                        changed = True
                    continue
                folder_path, name, entry_type = actual
                recorded = (entry.get("folder") or {}).get("path")
                if recorded and norm_path(recorded) != norm_path(folder_path):
                    findings.append(
                        {"file": rel, "doc": key, "token": token, "kind": "moved",
                         "detail": f"登记={recorded} 实际={folder_path}"}
                    )
                elif not recorded:
                    findings.append(
                        {"file": rel, "doc": key, "token": token, "kind": "no_folder_field",
                         "detail": folder_path}
                    )
                if write:
                    folder = entry.setdefault("folder", {})
                    prev = folder.get("path")
                    if prev and norm_path(prev) != norm_path(folder_path):
                        folder["prev_path"] = prev
                    folder["path"] = norm_path(folder_path)
                    folder["cloud_name"] = name
                    folder["entry_type"] = entry_type
                    folder["verified_at"] = today
                    entry["cloud_status"] = "ok"
                    changed = True
            if changed:
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump(data, fh, ensure_ascii=False, indent=2)
                    fh.write("\n")
                touched[os.path.relpath(path, REPO)] = len(docs)
    return findings, touched


def write_summary(out_dir, findings, error=None):
    """写一行摘要 + 机读结果。冷启动只 cat 那一行，亚秒、零 API 调用。"""
    out_dir = os.path.expanduser(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    try:
        os.chmod(out_dir, 0o700)
    except OSError:
        pass
    stamp = datetime.date.today().isoformat()
    if error:
        line = f"⚠️  云文档目录核对未完成（{stamp}）：{error}"
        payload = {"ran_at": stamp, "error": error}
    else:
        actionable = [f for f in findings if f["kind"] != "deleted_ack"]
        counts = {}
        for f in actionable:
            counts[f["kind"]] = counts.get(f["kind"], 0) + 1
        if not actionable:
            line = f"✅ 云文档目录核对 clean（{stamp}）"
        else:
            names = {"moved": "目录被挪", "deleted": "云端已删",
                     "outside": "不在我云盘", "unknown": "状态未知",
                     "no_folder_field": "缺 folder 登记"}
            parts = "，".join(f"{names.get(k, k)} {v} 条" for k, v in sorted(counts.items()))
            line = (f"📁 云文档目录核对（{stamp}）：{parts}"
                    f"——跑 scripts/ai-sync/check-cloud-doc-folders.py 看明细")
        payload = {"ran_at": stamp, "findings": findings}
    with open(os.path.join(out_dir, "summary.txt"), "w", encoding="utf-8") as fh:
        fh.write(line + "\n")
    with open(os.path.join(out_dir, "last-run.json"), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    return line


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="机读输出")
    ap.add_argument("--write", action="store_true", help="回写 folder 字段（默认只读）")
    ap.add_argument("--summary-out", metavar="DIR",
                    help="把一行摘要 + 机读结果写到该目录（供冷启动亚秒读取）")
    args = ap.parse_args()

    try:
        tree = load_drive_tree()
    except Exception as exc:
        print(f"STATUS: unreachable — 云盘树拉取失败：{exc}", file=sys.stderr)
        if args.summary_out:
            write_summary(args.summary_out, None, f"云盘不可达：{exc}")
        return 1

    findings, touched = scan(tree, write=args.write)
    # deleted_ack 是「已知且已登记」的存量事实，不算漂移、不改退出码
    actionable = [f for f in findings if f["kind"] != "deleted_ack"]

    if args.summary_out:
        write_summary(args.summary_out, findings)

    if args.json:
        print(json.dumps({"findings": findings, "written": touched,
                          "tree_entries": len(tree)}, ensure_ascii=False, indent=2))
        return 3 if actionable else 0

    if not findings:
        print(f"STATUS: clean — 云盘条目 {len(tree)}，cloud_docs 登记全部对得上")
    else:
        buckets = {}
        for f in findings:
            buckets.setdefault(f["kind"], []).append(f)
        label = {"moved": "🔴 目录漂移（文档被挪走）",
                 "deleted": "🔴 云端已删除",
                 "deleted_ack": "⚫ 云端已删除（已登记，不再告警）",
                 "outside": "🔸 不在我的云盘树（他人所有 / 知识库）",
                 "unknown": "🔸 状态未知",
                 "no_folder_field": "⚪ 尚无 folder 登记字段"}
        for kind, items in buckets.items():
            print(f"\n{label.get(kind, kind)}  ×{len(items)}")
            for i in items:
                print(f"  {i['file']}  «{i['doc']}»")
                print(f"      {i['detail']}")
    if touched:
        print(f"\n已回写 {len(touched)} 个 _status.json：")
        for f, n in touched.items():
            print(f"  {f}  ({n} 条登记)")
    return 3 if actionable and not args.write else 0


if __name__ == "__main__":
    sys.exit(main())
