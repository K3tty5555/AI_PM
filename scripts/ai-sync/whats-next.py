#!/usr/bin/env python3
"""在途工作队列（Stage4-A2 第一版）：一眼回答"下一步干啥"。

不重造轮子——站在 check-status-staleness.js 肩膀上（它已算好各项目最后更新/最新文件/
滞后/死链），本脚本只加**跨项目聚合 + 下一步推断/记录**这一层。

用法：
    python3 scripts/ai-sync/whats-next.py                 # 汇报：在途一览 + 推荐下一步
    python3 scripts/ai-sync/whats-next.py --set <项目> "<下一步文本>" [--due YYYY-MM-DD] [--kind 待续|等外部|待办|断点]
    python3 scripts/ai-sync/whats-next.py --done <项目>   # 清掉某项目的 next_action（做完了）
    python3 scripts/ai-sync/whats-next.py --json          # 机读

设计纪律（对齐项目铁律）：
- 亚秒级、只读 + 一次 node 调用（静默护栏）。
- AI 汇报 + 推荐动作，不是"列一堆让用户逐条选"（自动化别甩锅）。
- next_action 是权威（用户/AI 显式记的）；无则按 阶段+活跃度 **推断**并显式标「(推断)」，
  推断只做粗定位（在哪个阶段），不脑补越界判断（不硬说"该定稿了"）。
- 载体先建、逐步填：next_action 放 _status.json 顶层（同 cloud_docs 先例），不强制回填存量。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
PROJECTS = REPO / "output" / "projects"
STALENESS_JS = REPO / "scripts" / "ai-sync" / "check-status-staleness.js"
sys.path.insert(0, str(REPO / "scripts"))  # status_migrate 契约校验（--set 写前）

ACTIVE_DAYS = 7          # 最近 N 天动过 = 活跃
KIND_ICON = {"待续": "▶", "等外部": "⏸", "待办": "○", "断点": "⏯"}


def today() -> date:
    return datetime.now().date()


def parse_ymd(s: str):
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def days_ago(d) -> int | None:
    dd = parse_ymd(d) if isinstance(d, str) else d
    return (today() - dd).days if dd else None


def load_staleness() -> dict:
    """返回 {项目名: {newestDate, newestFile, updated, dead[]}}。"""
    try:
        out = subprocess.run(
            ["node", str(STALENESS_JS), str(PROJECTS), "--json", "--all"],
            capture_output=True, text=True, timeout=30,
        ).stdout
        rows = json.loads(out)
    except Exception as e:
        # 2026-07-12：staleness 层失效不再静默（node 缺失/超时会让"最近动于"失真）
        print(f"⚠️ staleness 层不可用（{type(e).__name__}），本报告的滞后/死链信息缺失", file=sys.stderr)
        rows = []
    result = {}
    for r in rows:
        iss = r.get("issues", {})
        st = iss.get("stale") or {}
        # 事实从 observed 读、告警从 issues 读（二轮复验 §六：此前正常项目 newestFile 恒 null，
        # 阶段推断失明）；老格式（无 observed）回退 issues.stale
        obs = r.get("observed") or {}
        result[r.get("name")] = {
            "newestDate": obs.get("newestDate") or st.get("newestDate"),
            "newestFile": obs.get("newestFile") or st.get("newestFile"),
            "updated": obs.get("updated") or st.get("updated"),
            "dead": iss.get("dead") or [],
        }
    return result


def status_path(project: str) -> Path:
    return PROJECTS / project / "_status.json"


def load_status(project: str) -> dict:
    p = status_path(project)
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def infer_next(newest_file: str, active_prd, quiet_days) -> str:
    """无 next_action 时的粗定位推断（低风险，只说阶段）。"""
    f = newest_file or ""
    if "08-review" in f:
        stage = "评审报告已出，看是否要落实决议 / 定稿"
    elif "06-prototype" in f:
        stage = "在原型阶段"
    elif "09-analytics" in f or "dashboard" in f:
        stage = "在做数据分析"
    elif "05-prd" in f and f.endswith(".md"):
        stage = "PRD 在写 / 在改"
    elif active_prd:
        stage = "有在做的 PRD"
    else:
        stage = "非 PRD 活跃（数据 / 运营 / 探索类）"
    if quiet_days is not None and quiet_days >= ACTIVE_DAYS:
        stage += f"，已 {quiet_days} 天没动，确认是否继续"
    return stage + "（推断）"


def build(stale: dict) -> list:
    rows = []
    seen = set(stale)
    # 也纳入有 _status.json 但 staleness 没覆盖的项目（兜底）
    for p in sorted(PROJECTS.iterdir()) if PROJECTS.exists() else []:
        if p.is_dir() and p.name not in seen and (p / "_status.json").exists():
            stale.setdefault(p.name, {})
    skipped_lifecycle = []
    for name, s in stale.items():
        st = load_status(name)
        # schema v1 lifecycle 语义落地（review 修复批）：归档/资料库不进在途报表
        if st.get("lifecycle") in ("archived", "reference"):
            skipped_lifecycle.append(name)
            continue
        newest = s.get("newestDate") or st.get("updated")
        quiet = days_ago(newest)
        na = st.get("next_action")
        if isinstance(na, str):
            na = {"text": na}
        rows.append({
            "project": name,
            "newestDate": newest,
            "newestFile": s.get("newestFile"),
            "quiet_days": quiet,
            "active_prd": st.get("active_prd"),
            "updated": st.get("updated"),
            "next_action": na,
            "dead": s.get("dead") or [],
        })
    build.skipped_lifecycle = skipped_lifecycle  # 供渲染层报数
    return rows


def tier(r) -> int:
    q = r["quiet_days"]
    active = q is not None and q < ACTIVE_DAYS
    has_prd = bool(r["active_prd"])
    if active and has_prd:
        return 0                      # 🔴 在做（PRD 进行中）
    if active:
        return 1                      # 🟢 近期活跃（数据/运营零活）
    if has_prd:
        return 2                      # 🟡 挂起（有 PRD 但久未动）
    return 3                          # ⚪ 背景


def next_line(r) -> str:
    na = r["next_action"]
    if na:
        txt = na.get("text", "")
        kind = na.get("kind")
        due = na.get("due")
        prefix = KIND_ICON.get(kind, "→") + (f"[{kind}]" if kind else "")
        s = f"{prefix} {txt}"
        if due:
            dd = days_ago(due)
            if dd is not None and dd >= 0:
                s += f" ⏰到期（{due}，已过 {dd} 天）" if dd > 0 else f" ⏰今天到期（{due}）"
            elif dd is not None:
                s += f"（{due}，还有 {-dd} 天）"
        return s
    return "→ " + infer_next(r["newestFile"], r["active_prd"], r["quiet_days"])


def render(rows) -> str:
    _skipped = getattr(build, "skipped_lifecycle", [])
    rows.sort(key=lambda r: (tier(r), r["quiet_days"] if r["quiet_days"] is not None else 9999))
    out = [f"📋 在途一览 · {today().isoformat()}（{len(rows)} 个项目" + (f"；归档/资料库 {len(_skipped)} 个不列" if _skipped else "") + "）"]
    # 到期/过期待办置顶单列（二轮复验 8.3：`0 or -1`→-1，今天到期曾进不了置顶区）
    def _due_reached(r):
        na = r["next_action"]
        dd = days_ago(na["due"]) if na and na.get("due") else None
        return dd is not None and dd >= 0
    due_hits = [r for r in rows if _due_reached(r)]
    if due_hits:
        out.append("\n⏰ 到点了：")
        for r in due_hits:
            out.append(f"  {r['project']} · {next_line(r)}")
    groups = {0: "🔴 在做（PRD 进行中）", 2: "🟡 挂起（有在做的 PRD 但一周+没动）"}
    for t in (0, 2):  # 详列：在做 + 挂起（各带下一步）
        grp = [r for r in rows if tier(r) == t and r not in due_hits]
        if not grp:
            continue
        out.append(f"\n{groups[t]}：")
        for r in grp:
            qd = r["quiet_days"]
            ago = "今天" if qd == 0 else (f"{qd}天前" if qd is not None else "?")
            out.append(f"  {r['project']} · 最近动于 {r['newestDate']}（{ago}）")
            out.append(f"    {next_line(r)}")
    active_zero = [r for r in rows if tier(r) == 1 and r not in due_hits]
    if active_zero:
        out.append(f"\n🟢 近期活跃（无在做 PRD，数据/运营零活，{len(active_zero)} 个）：" + "、".join(r["project"] for r in active_zero))
    bg = [r for r in rows if tier(r) == 3 and r not in due_hits]
    if bg:
        out.append(f"\n⚪ 背景（长期未动，{len(bg)} 个）：" + "、".join(r["project"] for r in bg))
    # 滞后 + 死链提示（复用 staleness 的判断）
    lag = [r for r in rows if r["updated"] and r["newestDate"] and r["updated"] < r["newestDate"] and tier(r) < 2]
    dead = [r for r in rows if r["dead"]]
    if lag or dead:
        out.append("")
        for r in lag:
            out.append(f"  ⚠️ {r['project']}：状态卡 updated={r['updated']} 落后于最新文件 {r['newestDate']}，跑 /ai-pm refresh 或手动校准")
        for r in dead:
            out.append(f"  🔗 {r['project']}：{len(r['dead'])} 处死链（README/记忆卡引用已失效）")
    return "\n".join(out)


def cmd_set(project, text, due, kind):
    p = status_path(project)
    if not p.exists():
        print(f"⛔ 找不到项目 {project}（{p}）")
        return 1
    st = json.loads(p.read_text(encoding="utf-8"))
    na = {"text": text}
    if kind:
        na["kind"] = kind
        if kind == "等外部":
            na["type"] = "external"  # 契约两轴：kind=工作流状态；type=责任主体（仅此项可安全映射，其余不猜）
    if due:
        if not parse_ymd(due):
            print(f"⛔ due 日期格式应为 YYYY-MM-DD：{due}")
            return 1
        na["due"] = due
    st["next_action"] = na
    # 写前契约校验（二轮复验 5.1：禁止生产器写出校验器不理解的结构）
    try:
        from status_migrate import validate as _validate
        errs = _validate(st)
        if errs:
            print("⛔ 契约校验未过，不写入：" + "；".join(errs))
            return 1
    except ImportError:
        print("⚠️ status_migrate 不可用，跳过写前契约校验", file=sys.stderr)
    p.write_text(json.dumps(st, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    back = json.loads(p.read_text(encoding="utf-8")).get("next_action", {})
    ok = back.get("text") == text
    print(f"{'✅' if ok else '⛔'} 已记 {project} 下一步：{next_line({'next_action': na})}")
    return 0 if ok else 1


def cmd_done(project):
    p = status_path(project)
    if not p.exists():
        print(f"⛔ 找不到项目 {project}")
        return 1
    st = json.loads(p.read_text(encoding="utf-8"))
    if st.pop("next_action", None) is None:
        print(f"（{project} 本来就没有记 next_action）")
        return 0
    p.write_text(json.dumps(st, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✅ 已清 {project} 的 next_action")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", nargs="+", metavar="PROJECT/TEXT")
    ap.add_argument("--done", metavar="PROJECT")
    ap.add_argument("--due")
    ap.add_argument("--kind", choices=["待续", "等外部", "待办", "断点"])
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    if a.done:
        return cmd_done(a.done)
    if a.set:
        if len(a.set) < 2:
            print('⛔ 用法：--set <项目> "<下一步文本>"')
            return 1
        return cmd_set(a.set[0], " ".join(a.set[1:]), a.due, a.kind)

    rows = build(load_staleness())
    if a.json:
        debts = []
        fdebts = REPO / "docs" / "_plan-debts.json"
        if fdebts.exists():
            try:
                debts = json.loads(fdebts.read_text(encoding="utf-8")).get("debts") or []
            except Exception:
                pass
        print(json.dumps({"projects": rows, "plan_debts": debts,
                          "lifecycle_skipped": getattr(build, "skipped_lifecycle", [])},
                         ensure_ascii=False, indent=2))
        return 0
    print(render(rows))
    print_plan_debts()
    return 0


def print_plan_debts() -> None:
    """G2：计划债机读台账（docs/_plan-debts.json）——「下一步干啥」同时答出计划债。"""
    f = REPO / "docs" / "_plan-debts.json"
    if not f.exists():
        return
    try:
        d = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        print("⚠️ _plan-debts.json 不可解析", file=sys.stderr)
        return
    debts = d.get("debts") or []
    if not debts:
        return
    icon = {"ai": "🤖可动", "trigger": "⏲扳机", "human": "🙋等你"}
    print(f"\n📌 计划债（{len(debts)} 条 · 台账截至 {d.get('updated')}）：")
    for x in debts:
        print(f"  {icon.get(x.get('type'), '·')} {x.get('text')}")


if __name__ == "__main__":
    sys.exit(main())
