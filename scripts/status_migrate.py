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
- next_action.kind=等外部 且无 type → 补 type=external（唯一可安全映射的责任主体，其余不猜）；
- 不迁 phases/notes 等自由字段。
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PROJECTS = REPO / "output" / "projects"
SCHEMA = REPO / "templates" / "project-index" / "status.schema.json"
REGISTRY = REPO / "templates" / "configs" / "workflow-phases.json"
# lifecycle 枚举单源=schema 文件（review 修复批：此前手写第二份，双源必漂）
LIFE = None  # 延迟到 _SCHEMA 定义后


def infer_lifecycle(name: str, d: dict) -> str:
    # 宁窄勿宽：只认零歧义信号——目录名/顶层 phase 字段；notes 散文里的"归档"二字
    # 不算数（实测会把"V1.1已上线归档"的活跃项目误判成 archived）
    if "归档" in name or "存档" in name:
        return "reference"
    if d.get("phase") == "archived" or d.get("last_phase") == "archived":
        return "archived"
    upd = str(d.get("updated", ""))[:10]
    try:
        age = (datetime.date.today() - datetime.date.fromisoformat(upd)).days
        return "active" if age <= 30 else "paused"
    except ValueError:
        return "paused"


_SCHEMA = json.loads(SCHEMA.read_text(encoding="utf-8"))
LIFE = set(_SCHEMA["properties"]["lifecycle"]["enum"])
try:
    _REGISTRY = json.loads(REGISTRY.read_text(encoding="utf-8"))
except (OSError, ValueError):
    _REGISTRY = {"phases": []}


def _check_value(name: str, v, spec: dict, errs: list) -> None:
    """按 spec 校验单值——覆盖关键字见 validate 文档串；顶层与嵌套共用一份逻辑。"""
    import re as _re
    if "const" in spec and v != spec["const"]:
        errs.append(f"{name} 应为 {spec['const']}: {v}")
    if "enum" in spec and v not in spec["enum"]:
        errs.append(f"{name} 非法枚举: {v}")
    ty = spec.get("type")
    pytypes = {"string": str, "object": dict, "integer": int}
    if ty in pytypes and not isinstance(v, pytypes[ty]):
        errs.append(f"{name} 类型应为 {ty}: {type(v).__name__}")
        return
    if isinstance(v, str):
        if "pattern" in spec and not _re.match(spec["pattern"], v):
            errs.append(f"{name} 不匹配 pattern: {v}")
        if len(v) < spec.get("minLength", 0):
            errs.append(f"{name} 短于 minLength={spec['minLength']}")


def validate(d: dict, registry: dict | None = None) -> list[str]:
    """**契约子集校验器**（诚实命名，二轮复验 5.2：不是完整 JSON Schema 执行器）。
    覆盖关键字：required / const / enum / type / pattern / minLength——含嵌套对象
    （next_action 的 text/kind/type/due 逐字段过同一套检查）+ 两条领域规则
    （phases 值必须 bool；lifecycle 与 last_phase 一致性）+ registry 消费
    （phases 键撞 registry 阶段 id 但该阶段 status_key 不同 = 漂移，二轮复验 5.3）。
    schema 新增其他关键字（minimum/format/…）需要在 _check_value 补实现——本函数不会自动跟上。"""
    errs = []
    for req in _SCHEMA.get("required", []):
        if req not in d:
            errs.append(f"缺必填 {req}")
    for k, spec in _SCHEMA.get("properties", {}).items():
        if k not in d:
            continue
        v = d[k]
        _check_value(k, v, spec, errs)
        if isinstance(v, dict) and "properties" in spec:  # 嵌套对象（next_action）逐字段
            for sub_req in spec.get("required", []):
                if not v.get(sub_req):
                    errs.append(f"{k} 缺 {sub_req}")
            for sk, sspec in spec["properties"].items():
                if sk in v:
                    _check_value(f"{k}.{sk}", v[sk], sspec, errs)
    # phases 值类型：键自由但值必须 bool——防 "done"/"1" 字串漂移
    reg = registry if registry is not None else _REGISTRY
    id_to_status_key = {p.get("id"): p.get("status_key") for p in reg.get("phases", [])}
    for pk, pv in (d.get("phases") or {}).items():
        if not isinstance(pv, bool):
            errs.append(f"phases.{pk} 值应为 bool: {pv!r}")
        # registry 真消费：键写成阶段 id 但 registry 说该阶段的 status_key 是别的 → 漂移
        # （如写 research 而实况键=competitor；零歧义信号才报，扩展键不管）
        if pk in id_to_status_key and id_to_status_key[pk] != pk:
            errs.append(f"phases.{pk} 应写 registry status_key={id_to_status_key[pk]}（阶段 id≠状态键，见 workflow-phases.json）")
    # lifecycle 与 phase 一致性（警告级并入错误——归档阶段不该是在途）
    if d.get("last_phase") == "archived" and d.get("lifecycle") in ("active", "paused"):
        errs.append(f"last_phase=archived 但 lifecycle={d['lifecycle']}（应为 archived/reference）")
    return errs


def selftest() -> int:
    bad = {"schema_version": 1, "project": "x", "lifecycle": "active",
           "updated": "not-a-date", "active_prd": "not-markdown.txt", "next_action": "wrong-type"}
    errs = validate(bad)
    assert any("updated" in e for e in errs), errs
    assert any("active_prd" in e for e in errs), errs
    assert any("next_action" in e for e in errs), errs
    good = {"schema_version": 1, "project": "x", "lifecycle": "active", "updated": "2026-07-12"}
    assert validate(good) == [], validate(good)
    # next_action 两轴契约（二轮复验 5.1）：生产形态（kind）合法；非法 kind/坏 due 报错
    ok_na = dict(good, next_action={"text": "等研发评审", "kind": "等外部", "type": "external"})
    assert validate(ok_na) == [], validate(ok_na)
    bad_na = dict(good, next_action={"text": "", "kind": "瞎写", "due": "7月13日"})
    errs2 = validate(bad_na)
    assert any("kind" in e for e in errs2) and any("due" in e for e in errs2) and any("text" in e for e in errs2), errs2
    # registry 真消费（二轮复验 5.3）：同一数据，registry 变 → 校验结果变
    reg = {"phases": [{"id": "research", "status_key": "competitor"}]}
    drift = dict(good, phases={"research": True})
    assert any("competitor" in e for e in validate(drift, registry=reg)), "registry 漂移未检出"
    assert validate(drift, registry={"phases": []}) == [], "registry 清空后不应再报——证明结果真由 registry 驱动"
    print(f"status_migrate selftest ok（契约子集校验：非法 {len(errs)}+{len(errs2)} 错、registry 消费双向验证）")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--validate", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()

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
        na = d.get("next_action")
        if isinstance(na, dict) and na.get("kind") == "等外部" and not na.get("type"):
            na["type"] = "external"
            changes.append("next_action 补 type=external（等外部唯一可安全映射）")
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
