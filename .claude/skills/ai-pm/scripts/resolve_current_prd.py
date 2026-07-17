#!/usr/bin/env python3
"""resolve_current_prd —— AI_PM「当前 PRD」唯一解析器（Phase 0·段一 Python 实现）。

极简规则（单一机读权威源，简到不可能漂移）：
  1. _status.json.active_prd 存在 **且文件真存在** → 用它（唯一机读权威源）
  2. 否则 05-prd/ 下**唯一**顶层 PRD md（排除 README/_*.md，不递归子目录）→ 用它（how=single，提示可归一）
  3. 否则按 _status.json.prd_versions[].ts 取最新且文件存在
  4. 仍歧义 → ambiguous（返回候选）：非交互场景优雅报错 / CLI 可请 PM 确认
README「当前活跃表」**不参与机读**（只人读）。

用法：
  python3 resolve_current_prd.py resolve <project_dir>
  python3 resolve_current_prd.py migrate <projects_root> [--apply]   # 默认 dry-run
"""
import sys, os, json, glob, shutil

STATUS_NAMES = ["_status.json", "project-status.json"]

def _status_path(project_dir):
    for n in STATUS_NAMES:
        p = os.path.join(project_dir, n)
        if os.path.exists(p):
            return p
    return None

def _load_status(project_dir):
    p = _status_path(project_dir)
    if not p:
        return None, {}
    try:
        return p, json.load(open(p, encoding="utf-8"))
    except Exception:
        return p, {}

def _top_prd_mds(project_dir):
    """05-prd/ 下顶层 PRD md（非递归；排除 README 和 _ 开头）。"""
    prd_dir = os.path.join(project_dir, "05-prd")
    if not os.path.isdir(prd_dir):
        return []
    out = []
    for f in sorted(glob.glob(os.path.join(prd_dir, "*.md"))):
        name = os.path.basename(f)
        if name == "README.md" or name.startswith("_"):
            continue
        out.append(name)
    return out

def resolve_current_prd(project_dir):
    """返回 dict: {file, how, candidates}. how ∈ active_prd|single|prd_versions_ts|ambiguous|none。
    file 是相对 05-prd/ 的文件名（或 None）。"""
    _, status = _load_status(project_dir)
    prd_dir = os.path.join(project_dir, "05-prd")
    # 1) active_prd 且文件存在
    ap = status.get("active_prd")
    if ap and os.path.exists(os.path.join(prd_dir, ap)):
        return {"file": ap, "how": "active_prd", "candidates": [ap]}
    mds = _top_prd_mds(project_dir)
    # 2) 唯一顶层 md
    if len(mds) == 1:
        return {"file": mds[0], "how": "single", "candidates": mds}
    # 3) prd_versions[].ts 取最新（且文件存在）
    pv = status.get("prd_versions")
    if isinstance(pv, list) and pv:
        dated = [x for x in pv if x.get("file") and x.get("ts")
                 and os.path.exists(os.path.join(prd_dir, x["file"]))]
        if dated:
            latest = max(dated, key=lambda x: x["ts"])["file"]
            return {"file": latest, "how": "prd_versions_ts", "candidates": [x.get("file") for x in pv]}
    # 4) 歧义 / 无
    if not mds:
        return {"file": None, "how": "none", "candidates": []}
    return {"file": None, "how": "ambiguous", "candidates": mds}

def _migrate(projects_root, apply):
    rows, flagged = [], []
    for project_dir in sorted(glob.glob(os.path.join(projects_root, "*"))):
        if not os.path.isdir(project_dir):
            continue
        name = os.path.basename(project_dir)
        sp, status = _load_status(project_dir)
        r = resolve_current_prd(project_dir)
        cur_ap = status.get("active_prd")
        # 幂等：已正确则跳过
        if r["how"] == "active_prd" and cur_ap == r["file"]:
            rows.append((name, "已有·跳过", r["file"]))
            continue
        if r["how"] in ("single", "prd_versions_ts") and r["file"]:
            # 写入前校验文件存在（resolve 已保证，但双重确认）
            if not os.path.exists(os.path.join(project_dir, "05-prd", r["file"])):
                flagged.append((name, "解析文件不存在", r["candidates"])); continue
            rows.append((name, f"写 active_prd（{r['how']}）", r["file"]))
            if apply and sp:
                shutil.copy2(sp, sp + ".bak")   # 备份
                status["active_prd"] = r["file"]
                json.dump(status, open(sp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        elif r["how"] == "ambiguous":
            flagged.append((name, "多 PRD·需 PM 定", r["candidates"]))
        # how==none：无 PRD，跳过
    print(f"=== 归一报告（{'APPLY 已写' if apply else 'DRY-RUN 未写'}）===")
    for n, act, f in rows:
        print(f"  [{act}] {n}: active_prd = {f}")
    if flagged:
        print("\n=== ⚠️ 需 PM 拍板（多 PRD / 异常，未写）===")
        for n, why, cands in flagged:
            print(f"  {n}（{why}）: {cands}")

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "resolve":
        print(json.dumps(resolve_current_prd(sys.argv[2]), ensure_ascii=False, indent=2))
    elif len(sys.argv) >= 3 and sys.argv[1] == "file":
        # 只打印当前 PRD 文件名（命令块用）；解析不出**不猜默认名**——stderr 报因 + exit 1，让调用方 || 兜底真正生效
        r = resolve_current_prd(sys.argv[2])
        if r.get("file"):
            print(r["file"])
        else:
            why = (f"多个 PRD 待 PM 定 active_prd（候选：{r['candidates']}）"
                   if r["how"] == "ambiguous"
                   else "未找到 PRD（05-prd/ 无顶层 md，且 _status.json 无可用 active_prd/prd_versions）")
            print(f"resolve_current_prd: 无法确定当前 PRD —— {why}", file=sys.stderr)
            sys.exit(1)
    elif len(sys.argv) >= 3 and sys.argv[1] == "migrate":
        _migrate(sys.argv[2], apply="--apply" in sys.argv)
    else:
        print(__doc__)
