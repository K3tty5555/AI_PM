#!/usr/bin/env python3
"""intake 阶段③执行器——写侧唯一入口。

顺序铁律（spec §3）：骨架+初始 _status.json → 复制（子路径保留/哈希一致跳过）
→ active_prd → bootstrap --apply → 记 copied；Claude 补 claims 后 verify（contracts + validate）
全过才记 done。
重跑分支：已 done 跳过（cluster_ids 不同则报错）/ copied 未 done 提示补 claims 跑 verify /
我们的半成品续传（notes 带 intake 标记判据，别人的目录一律拒绝）/ 全新执行。
确认阶段走 stage / decide 子命令（decide 追加 decisions.jsonl），不手工 Edit manifest。
"""
from __future__ import annotations
import argparse, datetime, hashlib, json, re, shutil, subprocess, sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from status_migrate import infer_lifecycle  # noqa: E402
from aipm_intake_scan import sanitize_name, will_migrate  # noqa: E402  单源：sanitize/迁移口径只在 scan 定义

# 上游单源 = .claude/skills/ai-pm/SKILL.md「输出容器与项目目录结构」目录树（2026-10 快照）。
# 改骨架先改那里再同步这里，别单边加目录（R24）。
SKELETON_DIRS = ["01-requirement-draft", "02-analysis-report", "03-competitor-report",
                 "04-user-stories", "05-prd", "06-prototype", "07-references", "08-reviews",
                 "_memory", "_logs"]
KLASS_TARGET = {"md": "05-prd", "html": "06-prototype/_imported", "docx": "05-prd",
                "data": "09-analytics", "ppt": "08-reviews", "doc": "07-references/intake-raw"}
# klass=unclassified（图片/安装包/二进制）不在表里：默认不迁移（C2-2，与 report「默认不迁移」一致）
ACTIVE_PRD_RE = re.compile(r"^(?!05-prd/).+\.md$")
DECIDE_ACTIONS = ("confirm", "rename", "exclude", "skip", "install-skill")


def _load(p: Path) -> dict: return json.loads(Path(p).read_text(encoding="utf-8"))
def _save(p: Path, d: dict) -> None:
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(p)
def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()
def _migrated_line(mdir: Path, source_abs: str, target_rel: str, sha: str, decision: str, action: str) -> None:
    rec = {"ts": datetime.datetime.now().isoformat(timespec="seconds"), "source_abs": source_abs,
           "target_rel": target_rel, "sha256": sha, "decision": decision, "action": action}
    with (mdir / "migrated.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def _decisions(mdir: Path) -> dict[str, dict]:
    """decisions.jsonl → {path: 最后一条决策}（同一路径后决策覆盖前决策）。"""
    out: dict[str, dict] = {}
    jl = mdir / "decisions.jsonl"
    if jl.exists():
        for line in jl.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                out[rec["path"]] = rec
    return out


def _skip_reason(f: dict, decisions: dict[str, dict]) -> str | None:
    """返回跳过原因；None = 迁移。默认口径单源 = scan.will_migrate。
    exclude 决策命中文件本身或其上级目录 → 跳；凭证/超大只有用户对该文件逐个 confirm 才纳入；
    hidden/unreadable/dataless/unclassified 无例外。"""
    path = f["path"]
    for d, rec in decisions.items():
        if rec.get("action") == "exclude" and (path == d or path.startswith(d.rstrip("/") + "/")):
            return "exclude"
    for key in ("hidden", "unreadable", "dataless"):
        if f.get(key):
            return key
    if f.get("klass") == "unclassified":
        return "unclassified"
    if f.get("credential_hit") or f.get("oversize"):
        if decisions.get(path, {}).get("action") == "confirm":
            return None
        return "credential_hit" if f.get("credential_hit") else "oversize"
    return None if will_migrate(f) else "unclassified"


def cmd_project(mpath: str, cluster_ids: list[str], name: str,
                active_prd: str | None = None, repo: Path | None = None) -> str:
    repo = repo or ROOT
    mpath = Path(mpath); m = _load(mpath); mdir = mpath.parent
    # I6：入口设防——名字必须已 sanitize（防 ../ 逃逸与非法字符目录名）
    if name != sanitize_name(name):
        raise SystemExit(f"项目名未过 sanitize: {name!r}（应为 {sanitize_name(name)!r}）")
    # I2：active_prd 校验放在最前（任何副作用之前）
    if active_prd:
        if ".." in PurePosixPath(active_prd).parts or not ACTIVE_PRD_RE.match(active_prd):
            raise SystemExit(f"active_prd 违反契约: {active_prd}")
    prior = next((e for e in m["executed_projects"] if e["name"] == name), None)
    if prior and (prior.get("done") or prior.get("copied")):
        if sorted(prior.get("cluster_ids", [])) != sorted(cluster_ids):
            raise SystemExit(f"项目 {name} 已登记 cluster_ids={prior.get('cluster_ids')}，"
                             f"本次 {cluster_ids} 不一致——换个项目名或人工处理")
        if prior.get("done"):
            return "已完成，跳过"
        return f"已复制，待补 claims 后跑 verify：{name}"
    clusters = [c for c in m["clusters"] if c["cluster_id"] in cluster_ids]
    if len(clusters) != len(cluster_ids):
        raise SystemExit(f"cluster_id 不全: 要 {cluster_ids}，命中 {[c['cluster_id'] for c in clusters]}")
    proj = repo / "output/projects" / name
    # I4 三分支的前置判据：目录存在时，只有「我们建的半成品」（notes 带 intake 标记）才续传；
    # 别人的已有项目（无 _status.json 或 notes 不带标记）一律拒绝，绝不覆盖
    def _is_ours(p: Path) -> bool:
        try:
            return "intake 导入" in _load(p / "_status.json").get("notes", "")
        except (OSError, ValueError):
            return False
    if proj.exists() and not _is_ours(proj):
        raise SystemExit(f"目标已存在: {proj}——不覆盖，人工处理（spec §5 闸 2）")
    resuming = proj.exists()  # 我们的半成品 → 续传（逐文件哈希跳过 + bootstrap 重入容忍）
    for d in SKELETON_DIRS + (["09-analytics"] if any(
            f["klass"] == "data" for c in clusters for f in c["files"]) else []):
        (proj / d).mkdir(parents=True, exist_ok=True)
    if not (proj / "README.md").exists():
        (proj / "README.md").write_text(
            f"# {name}\n\nintake 导入项目。原文件在 {m['root']}，未移动。\n", encoding="utf-8")
    newest = max(c.get("newest_mtime", "") for c in clusters)[:10]
    if not (proj / "_status.json").exists():  # bootstrap 第一步就读它，顺序不可颠倒
        _save(proj / "_status.json", {
            "schema_version": 1, "project": name,
            "updated": newest or datetime.date.today().isoformat(),
            # active_prd 无 md 时不写键（schema：可缺省，但出现必须是 string，写 null 过不了 validate）
            "lifecycle": infer_lifecycle(name, {"updated": newest}),
            "notes": "intake 导入" + ("；PRD 未数字化（仅 docx）" if not active_prd else "")})
    root = Path(m["root"])
    decisions = _decisions(mdir)
    for c in clusters:
        for f in c["files"]:
            reason = _skip_reason(f, decisions)
            if reason:
                _migrated_line(mdir, str(root / f["path"]), "(跳过)", "", reason, "skip")
                continue
            # I5：保留簇内相对子路径，同名文件不互相覆盖
            rel = f["path"]
            top = c["source_dirs"][0]
            inner = rel[len(top) + 1:] if rel.startswith(top + "/") else Path(rel).name
            target = proj / KLASS_TARGET[f["klass"]] / inner
            target.parent.mkdir(parents=True, exist_ok=True)
            src = root / f["path"]
            if target.exists():
                if _sha256(target) == _sha256(src):
                    continue  # 续传：已复制过
                raise SystemExit(f"目标已存在且内容不同: {target}（源 {src}）——停项人工裁决")
            shutil.copy2(src, target)
            _migrated_line(mdir, str(src), target.relative_to(proj).as_posix(), _sha256(target),
                           decisions.get(f["path"], {}).get("action", "confirm"), "copy")
    if active_prd:  # 格式校验已在函数开头；这里核存在性（I2）
        if not (proj / "05-prd" / active_prd).is_file():
            have = sorted(x.relative_to(proj / "05-prd").as_posix() for x in (proj / "05-prd").rglob("*.md"))
            raise SystemExit(f"active_prd 不存在: 05-prd/{active_prd}——05-prd 下实际有: {have or '（无 md）'}")
        st = _load(proj / "_status.json"); st["active_prd"] = active_prd
        _save(proj / "_status.json", st)
    # S1：--project 是路径语义，传完整路径；重入报「已有 baseline」按已完成处理（I4）
    r = subprocess.run([sys.executable, str(repo / "scripts/aipm_contracts.py"), "bootstrap",
                        "--project", str(proj), "--type", "import", "--apply"],
                       capture_output=True, text=True, cwd=str(repo))
    if r.returncode != 0 and "已有 baseline" not in (r.stdout + r.stderr):
        raise SystemExit(f"bootstrap 失败: {(r.stderr or r.stdout).strip()[:300]}")
    m = _load(mpath)  # 重读：别的子命令（stage 等）可能改过 manifest
    m["executed_projects"] = [e for e in m["executed_projects"] if e["name"] != name]
    m["executed_projects"].append({"cluster_ids": cluster_ids, "name": name, "copied": True,
                                   "ts": datetime.datetime.now().isoformat(timespec="seconds")})
    _save(mpath, m)
    return (("续传完成" if resuming else "项目落盘完成")
            + f"：{name}（baseline 已建，待 Claude 补 claims 后跑 verify）")


def cmd_verify(mpath: str, name: str, repo: Path | None = None) -> str:
    """I3：完成判定 = 项目契约（contracts project：status artifacts + baseline 含 claims gate）
    + status_migrate --validate 里该项目那一行合规。两者都过才写 done。

    status_migrate --validate 校验的是全仓所有项目、退出码受别的项目牵连，
    所以只认本项目那一行（spec §3 第 6 步「验该项目合规」）。"""
    repo = repo or ROOT
    mpath = Path(mpath); m = _load(mpath)
    entry = next((e for e in m["executed_projects"] if e["name"] == name), None)
    if not entry or not entry.get("copied"):
        raise SystemExit(f"{name} 尚未执行 project 子命令，不能 verify")
    if entry.get("done"):
        return f"已完成，跳过：{name}"
    proj = repo / "output/projects" / name
    problems = []
    r = subprocess.run([sys.executable, str(repo / "scripts/aipm_contracts.py"), "project",
                        "--project", str(proj)], capture_output=True, text=True, cwd=str(repo))
    if r.returncode != 0:
        problems.append("项目契约未过: " + (r.stdout + r.stderr).strip()[:600])
    r2 = subprocess.run([sys.executable, str(repo / "scripts/status_migrate.py"), "--validate"],
                        capture_output=True, text=True, cwd=str(repo))
    ok_line = re.compile(rf"^\s*✅ {re.escape(name)}\s*$", re.M)
    if not ok_line.search(r2.stdout):
        mine = [ln.strip() for ln in r2.stdout.splitlines() if f" {name}" in ln]
        problems.append("status_migrate --validate 未过: " + ("; ".join(mine) or (r2.stdout + r2.stderr).strip()[:300]))
    if problems:
        raise SystemExit(f"verify 未通过（未写 done）：{name}\n" + "\n".join(problems))
    m = _load(mpath)
    for e in m["executed_projects"]:
        if e["name"] == name:
            e["done"] = True
            e["verified_at"] = datetime.datetime.now().isoformat(timespec="seconds")
    _save(mpath, m)
    return f"verify 通过：{name}（契约 + validate 全绿，已记 done）"


def cmd_stage(mpath: str, to: str) -> str:
    """I4：阶段置位只走脚本（原子写），不手工 Edit manifest。"""
    if to not in ("confirm", "exec"):
        raise SystemExit(f"stage 只能置 confirm|exec（done 由 finish 置）: {to}")
    mpath = Path(mpath); m = _load(mpath)
    m["stage"] = to
    _save(mpath, m)
    return f"stage → {to}"


def cmd_decide(mpath: str, path: str, action: str, final_name: str | None = None) -> str:
    """I4：每确认一项立即追加一行 decisions.jsonl（中断不丢；同一路径以最后一条为准）。"""
    if action not in DECIDE_ACTIONS:
        raise SystemExit(f"action 非法: {action}")
    if action == "rename" and not final_name:
        raise SystemExit("rename 必须给 --final-name")
    if final_name is not None and final_name != sanitize_name(final_name):
        raise SystemExit(f"final_name 未过 sanitize: {final_name!r}（应为 {sanitize_name(final_name)!r}）")
    rec = {"ts": datetime.datetime.now().isoformat(timespec="seconds"), "path": path,
           "action": action, "final_name": final_name}
    with (Path(mpath).parent / "decisions.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return f"已记录：{action} {path}" + (f" → {final_name}" if final_name else "")


def cmd_skill(repo: Path, src_dir: Path, name: str) -> str:
    """装载四道闸的机械部分：registry 复查 + 目录拒绝覆盖 + gitignore 追加（spec §5）。"""
    if name != sanitize_name(name):
        raise SystemExit(f"skill 名未过 sanitize: {name!r}")
    repo = repo or ROOT
    reg_path = repo / "templates/configs/capability-registry.json"
    reg = _load(reg_path)
    if any(c.get("skill") == name or c.get("id") == name for c in reg.get("capabilities", [])):
        raise SystemExit(f"registry 已有 {name}——拒绝重复装载")  # R20：运行间隙复查
    target = repo / ".claude/skills" / name
    if target.exists():
        raise SystemExit(f"目标已存在: {target}——列为人工合并候选，绝不就地覆盖")
    shutil.copytree(src_dir, target, symlinks=True)  # 不跟随 symlink：外部 skill 里的链接不能把目录外内容带进来
    reg["capabilities"].append({"id": name, "skill": name, "availability": "optional-private",
                                "modes": [], "phase_effect": {"kind": "none"},
                                "artifacts": ["external-skill"], "side_effects": ["read-project", "write-local"],
                                "legacy_commands": [f"/{name}"]})
    _save(reg_path, reg)
    gi = repo / ".gitignore"
    line = f".claude/skills/{name}/"
    text = gi.read_text(encoding="utf-8") if gi.exists() else ""
    if line not in text:
        gi.write_text(text.rstrip("\n") + "\n" + line + "\n", encoding="utf-8")
    return f"skill {name} 已装载（registry + gitignore 已同步）"


def cmd_skill_from_manifest(mpath: str, cand_path: str, name: str, repo: Path | None = None) -> str:
    """I1：--path 只认 manifest.skill_candidates[].path（SKILL.md 文件路径），取 parent 作源目录。
    三道边界：必须是候选、resolve 后在 manifest.root 之下、源目录确有 SKILL.md。"""
    mpath = Path(mpath); m = _load(mpath)
    cand = next((c for c in m.get("skill_candidates", []) if c.get("path") == cand_path), None)
    if cand is None:
        raise SystemExit(f"--path 不在 manifest.skill_candidates 里: {cand_path}")
    if not cand.get("frontmatter_ok"):
        raise SystemExit(f"候选 frontmatter 不合规，不装载: {cand_path}")
    root = Path(m["root"]).resolve()
    skill_md = (root / cand_path).resolve()
    try:
        skill_md.relative_to(root)
    except ValueError:
        raise SystemExit(f"--path 越出扫描根 {root}: {cand_path}")
    if skill_md.name != "SKILL.md" or not skill_md.is_file():
        raise SystemExit(f"源目录缺 SKILL.md: {skill_md.parent}")
    out = cmd_skill(repo or ROOT, skill_md.parent, name)
    _migrated_line(mpath.parent, str(skill_md.parent), f".claude/skills/{name}/", "", "confirm", "install-skill")
    return out


def cmd_finish(mpath: str) -> str:
    """R21：三口径对账行——迁了/跳了/未处理簇。"""
    mpath = Path(mpath); m = _load(mpath)
    m["stage"] = "done"; _save(mpath, m)
    migrated = skipped = 0
    seen_skip = set()  # I1 skip 去重：按 source_abs 去重
    jl = mpath.parent / "migrated.jsonl"
    if jl.exists():
        for line in jl.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rec = json.loads(line)
                if rec.get("action") in ("copy", "install-skill"):
                    migrated += 1
                elif rec.get("action") == "skip":
                    src = rec.get("source_abs")
                    if src not in seen_skip:
                        skipped += 1
                        seen_skip.add(src)
    # 已处理簇 = verify 通过（done）的 executed_projects 的 cluster_ids 并集；只复制未 verify 的不算
    executed_cluster_ids = set()
    for e in m["executed_projects"]:
        if e.get("done"):
            executed_cluster_ids.update(e.get("cluster_ids", []))
    pending = len(m["clusters"]) - len(executed_cluster_ids)
    return (f"intake 完成：迁 {migrated} / 跳 {skipped} / 未处理簇 {pending}；"
            f"原文件未动，后续修改不会自动同步")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("project"); p1.add_argument("--manifest", required=True)
    p1.add_argument("--cluster-id", action="append", required=True)  # S2：可重复，多簇合并
    p1.add_argument("--name", required=True); p1.add_argument("--active-prd", default=None)
    p2 = sub.add_parser("skill"); p2.add_argument("--manifest", required=True)
    p2.add_argument("--path", required=True, help="manifest.skill_candidates[].path 原值（xxx/SKILL.md）")
    p2.add_argument("--name", required=True)
    p2.add_argument("--repo", default=str(ROOT), help=argparse.SUPPRESS)  # 测试注入假仓
    p3 = sub.add_parser("finish"); p3.add_argument("--manifest", required=True)
    p4 = sub.add_parser("verify"); p4.add_argument("--manifest", required=True)
    p4.add_argument("--name", required=True)
    p5 = sub.add_parser("stage"); p5.add_argument("--manifest", required=True)
    p5.add_argument("--to", required=True, choices=["confirm", "exec"])
    p6 = sub.add_parser("decide"); p6.add_argument("--manifest", required=True)
    p6.add_argument("--path", required=True); p6.add_argument("--action", required=True, choices=DECIDE_ACTIONS)
    p6.add_argument("--final-name", default=None)
    for sp in (p1, p4):
        sp.add_argument("--repo", default=str(ROOT), help=argparse.SUPPRESS)  # 测试注入假仓
    args = ap.parse_args()
    if args.cmd == "verify":
        print(cmd_verify(args.manifest, args.name, Path(args.repo)))
    elif args.cmd == "stage":
        print(cmd_stage(args.manifest, args.to))
    elif args.cmd == "decide":
        print(cmd_decide(args.manifest, args.path, args.action, args.final_name))
    elif args.cmd == "project":
        print(cmd_project(args.manifest, args.cluster_id, args.name, args.active_prd, Path(args.repo)))
    elif args.cmd == "skill":
        print(cmd_skill_from_manifest(args.manifest, args.path, args.name, Path(args.repo)))
    else:
        print(cmd_finish(args.manifest))
    return 0


if __name__ == "__main__":
    sys.exit(main())
