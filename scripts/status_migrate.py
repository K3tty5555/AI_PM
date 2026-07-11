#!/usr/bin/env python3
"""_status.json v1 迁移器 + 校验器（合并计划波3 · 最小契约）。

用法：
    python3 scripts/status_migrate.py                # dry-run：逐项目报告将发生什么（默认，零写）
    python3 scripts/status_migrate.py --apply        # 执行迁移（原子写：tmp+rename；只增不删）
    python3 scripts/status_migrate.py --validate     # 只按 schema 校验现状（迁移后应全绿）

迁移规则（只增不删，未知字段原样保留）：
- 补 schema_version=1；
- 补 lifecycle（推断：目录名/字段含归档→reference 或 archived；updated 距今 ≤30 天→active；
  其余→paused；推断结果打印出来供人纠正——机器只给初值，语义由人后续校准）；
- active_prd 带 "05-prd/" 前缀的去前缀（resolver 契约）；
- 不迁 phases/notes 等自由字段。
"""
import argparse
import datetime
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PROJECTS = REPO / "output" / "projects"
SCHEMA = REPO / "templates" / "project-index" / "status.schema.json"
# lifecycle 枚举单源=schema 文件（review 修复批：此前手写第二份，双源必漂）
LIFE = set(json.loads(SCHEMA.read_text(encoding="utf-8"))["properties"]["lifecycle"]["enum"])


def infer_lifecycle(name: str, d: dict) -> str:
    # 宁窄勿宽：只认零歧义信号——目录名/顶层 phase 字段；notes 散文里的"归档"二字
    # 不算数（实测会把"V1.1已上线归档"的活跃项目误判成 archived）
    if "归档" in name or "存档" in name:
        return "reference"
    if d.get("phase") == "archived":
        return "archived"
    upd = str(d.get("updated", ""))[:10]
    try:
        age = (datetime.date.today() - datetime.date.fromisoformat(upd)).days
        return "active" if age <= 30 else "paused"
    except ValueError:
        return "paused"


def validate(d: dict) -> list[str]:
    errs = []
    if d.get("schema_version") != 1:
        errs.append("缺 schema_version=1")
    if not d.get("project"):
        errs.append("缺 project")
    if d.get("lifecycle") not in LIFE:
        errs.append(f"lifecycle 非法: {d.get('lifecycle')}")
    if not str(d.get("updated", "")).strip():
        errs.append("缺 updated")
    ap = d.get("active_prd")
    if ap and ap.startswith("05-prd/"):
        errs.append(f"active_prd 带 05-prd/ 前缀（应为相对 05-prd/ 的路径）: {ap}")
    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--validate", action="store_true")
    a = ap.parse_args()

    files = sorted(PROJECTS.glob("*/_status.json"))
    if not files:
        print("未找到任何 _status.json")
        return 1
    bad = 0
    for f in files:
        name = f.parent.name
        d = json.loads(f.read_text(encoding="utf-8"))
        if a.validate:
            errs = validate(d)
            print(f"  {'✅' if not errs else '❌'} {name}" + (f" — {'; '.join(errs)}" if errs else ""))
            bad += bool(errs)
            continue
        changes = []
        if not d.get("project"):
            d["project"] = name
            changes.append("＋project(目录名)")
        if not str(d.get("updated", "")).strip():
            d["updated"] = datetime.date.today().isoformat()
            changes.append("＋updated(今日)")
        if d.get("schema_version") != 1:
            d["schema_version"] = 1
            changes.append("＋schema_version=1")
        if d.get("lifecycle") not in LIFE:
            d["lifecycle"] = infer_lifecycle(name, d)
            changes.append(f"＋lifecycle={d['lifecycle']}(推断)")
        ap_val = d.get("active_prd")
        if ap_val and ap_val.startswith("05-prd/"):
            d["active_prd"] = ap_val.removeprefix("05-prd/")
            changes.append("active_prd 去前缀")
        if not changes:
            print(f"  ✓ {name}（已合规）")
            continue
        print(f"  {'✍️' if a.apply else '📋'} {name}: {', '.join(changes)}")
        if a.apply:
            tmp = f.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(tmp, f)  # 原子替换
            back = json.loads(f.read_text(encoding="utf-8"))
            if back.get("schema_version") != 1:
                print(f"    ⛔ 读回验证失败：{name}")
                return 2
    if a.validate:
        print(f"\n校验完成：{len(files) - bad}/{len(files)} 合规")
        return 1 if bad else 0
    if not a.apply:
        print("\n（dry-run 结束——确认无误后 --apply 执行；lifecycle 推断值供人纠正）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
