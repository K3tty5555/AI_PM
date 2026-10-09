#!/usr/bin/env python3
"""intake 阶段③执行器——写侧唯一入口。

顺序铁律（spec §3）：先算执行计划（文件集 = 各簇 ∪ --include 命中的候选；拦截/剔除/symlink/
一文件一项目/零文件都在这里判，无副作用）→ 骨架+初始 _status.json → 复制（剥最终文件集的最长公共
目录前缀、保留子路径；同名异内容加来源目录名前缀；哈希一致跳过）→ active_prd → bootstrap --apply
→ 记 copied；Claude 补 claims 后 verify（contracts + validate）全过才记 done。
重跑分支：已 done 跳过 / copied 未 done 提示补 claims 跑 verify（两者都要求 (cluster_ids, includes)
规范化组合与登记一致，否则报错）/ 我们的半成品续传（notes 带 intake 标记判据，别人的目录一律拒绝）/ 全新执行。
确认阶段走 stage / decide 子命令（decide 追加 decisions.jsonl），不手工 Edit manifest；
exclude 只收候选文件路径，整簇不迁走 decide --cluster-id X --action skip-cluster。
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
DECIDE_ACTIONS = ("confirm", "rename", "exclude", "skip", "install-skill", "skip-cluster")
CLUSTER_ACTIONS = ("skip-cluster", "confirm")  # --cluster-id 可配的动作；confirm = 撤销该簇的 skip-cluster


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
def _migrated_line(mdir: Path, source_abs: str, target_rel: str, sha: str, decision: str, action: str,
                   **extra) -> None:
    """extra：project（归属项目，§3.3 一文件一项目的判据）/ renamed_from / allow_dup / dup_of。"""
    rec = {"ts": datetime.datetime.now().isoformat(timespec="seconds"), "source_abs": source_abs,
           "target_rel": target_rel, "sha256": sha, "decision": decision, "action": action}
    rec.update({k: v for k, v in extra.items() if v is not None})
    with (mdir / "migrated.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def _read_jsonl(p: Path) -> list[dict]:
    if not p.exists():
        return []
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


def _decisions(mdir: Path) -> dict[str, dict]:
    """decisions.jsonl 里按文件路径的决策 → {path: 最后一条决策}（同一路径后决策覆盖前决策）。"""
    return {rec["path"]: rec for rec in _read_jsonl(mdir / "decisions.jsonl") if rec.get("path")}


def _cluster_decisions(mdir: Path) -> dict[str, dict]:
    """按簇的决策（decide --cluster-id：skip-cluster / confirm 撤销）→ {cluster_id: 最后一条}。"""
    return {rec["cluster_id"]: rec for rec in _read_jsonl(mdir / "decisions.jsonl")
            if rec.get("cluster_id") and not rec.get("path")}


def _candidates(m: dict) -> dict[str, tuple[dict, str]]:
    """候选清单 = 所有簇 files 的并集：{path: (文件条目, 所属 cluster_id)}（Ruling 21）。"""
    return {f["path"]: (f, c["cluster_id"]) for c in m["clusters"] for f in c["files"]}


def _legacy_excludes(decisions: dict[str, dict], cands: dict) -> tuple[dict[str, dict], list[str]]:
    """§4：exclude 只认候选文件路径。旧版写下的目录前缀（或已不在候选里的路径）exclude 记录读取时忽略，
    返回 (清洗后的决策, 被忽略的路径)；调用方负责把告警打印出来。"""
    ignored = sorted(p for p, r in decisions.items() if r.get("action") == "exclude" and p not in cands)
    return {p: r for p, r in decisions.items() if p not in ignored}, ignored


def _legacy_warning(ignored: list[str]) -> str:
    if not ignored:
        return ""
    return ("\n⚠️ 已忽略 {} 条非文件路径的 exclude 记录（旧版目录前缀语义已废，整簇不迁请用 skip-cluster）：{}"
            .format(len(ignored), "、".join(ignored)))


def _skip_reason(f: dict, decisions: dict[str, dict], cluster_skipped: bool = False) -> str | None:
    """返回跳过原因；None = 迁移。默认口径单源 = scan.will_migrate。
    exclude 只做文件路径精确匹配（§4，目录前缀分支已删）；所属簇被 skip-cluster → 跳；
    凭证/超大只有用户对该文件逐个 confirm 才纳入；hidden/unreadable/dataless/unclassified 无例外。"""
    path = f["path"]
    if decisions.get(path, {}).get("action") == "exclude":
        return "exclude"
    if cluster_skipped:
        return "skip-cluster"
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


def _norm_include(raw: str) -> str:
    """§3.1：--include 是候选清单里的相对路径（文件或目录前缀）。拒绝绝对路径与 ..；不拼文件系统路径。"""
    if raw.startswith(("/", "~", "\\")) or re.match(r"^[A-Za-z]:", raw):
        raise SystemExit(f"--include 不接受绝对路径: {raw!r}（给扫描根下的相对路径）")
    parts = [x for x in raw.replace("\\", "/").split("/") if x not in ("", ".")]
    if ".." in parts:
        raise SystemExit(f"--include 不接受含 .. 的路径: {raw!r}")
    if not parts:
        raise SystemExit(f"--include 为空: {raw!r}")
    return "/".join(parts)


def _common_dir(paths: list[str]) -> tuple[str, ...]:
    """最终文件集的最长公共目录前缀（按路径分量）。"""
    dirs = [PurePosixPath(p).parent.parts for p in paths]
    common = dirs[0]
    for d in dirs[1:]:
        n = 0
        while n < min(len(common), len(d)) and common[n] == d[n]:
            n += 1
        common = common[:n]
    return common


def _owners(mdir: Path, m: dict) -> dict[str, set[str]]:
    """§3.3：源文件 → 已复制过它的项目名集合（migrated.jsonl 的 copy 记录 + executed_projects.files）。"""
    root = Path(m["root"])
    out: dict[str, set[str]] = {}
    for rec in _read_jsonl(mdir / "migrated.jsonl"):
        if rec.get("action") == "copy" and rec.get("project"):
            out.setdefault(rec["source_abs"], set()).add(rec["project"])
    for e in m.get("executed_projects", []):
        for rel in e.get("files", []):
            out.setdefault(str(root / rel), set()).add(e["name"])
    return out


def _safe_source(root: Path, rel: str) -> str | None:
    """§7：复制前复核源——自身是 symlink、路径中间有 symlink、resolve 后越出扫描根、已不存在 → 返回原因。"""
    src = root / rel
    if src.is_symlink():
        return "symlink"
    if not src.exists():
        return "missing"
    real = src.resolve()
    root_real = root.resolve()
    try:
        real.relative_to(root_real)
    except ValueError:
        return "outside-root"
    if real != root_real / rel:  # 中间目录被换成 symlink（哪怕仍指向根内）也不跟随
        return "symlink"
    return None


def _renamed_target(target: Path, src_rel: str, src: Path) -> Path | None:
    """§3.2：目标同名且内容不同 → 文件名前加来源末段目录名（会议纪要__README.md）；仍撞则再加序号。
    返回可写入的新目标；若某个消歧名下已有同内容文件（续传）返回 None。"""
    parts = PurePosixPath(src_rel).parts
    prefix = parts[-2] if len(parts) >= 2 else "根目录"
    want = _sha256(src)
    for i in range(1, 100):
        alt = target.with_name(f"{prefix}__{target.name}" if i == 1 else f"{prefix}__{i}__{target.name}")
        if not alt.exists():
            return alt
        if alt.is_file() and _sha256(alt) == want:
            return None
    raise SystemExit(f"同名消歧失败（99 次仍撞）: {target}")


def cmd_project(mpath: str, cluster_ids: list[str] | None, name: str,
                active_prd: str | None = None, repo: Path | None = None, *,
                includes: list[str] | None = None, reason: str | None = None, allow_dup: bool = False) -> str:
    """§3：文件集 = 各簇 ∪ include 命中的候选（按 path 去重）。先算完整执行计划（零文件 / 一文件一项目 /
    symlink 都在这里拦），任何副作用（mkdir、README、_status.json、migrated.jsonl）都在计划通过之后。"""
    repo = repo or ROOT
    mpath = Path(mpath); m = _load(mpath); mdir = mpath.parent
    # I6：入口设防——名字必须已 sanitize（防 ../ 逃逸与非法字符目录名）
    if name != sanitize_name(name):
        raise SystemExit(f"项目名未过 sanitize: {name!r}（应为 {sanitize_name(name)!r}）")
    # I2：active_prd 校验放在最前（任何副作用之前）
    if active_prd:
        if ".." in PurePosixPath(active_prd).parts or not ACTIVE_PRD_RE.match(active_prd):
            raise SystemExit(f"active_prd 违反契约: {active_prd}")
    cids = sorted(set(cluster_ids or []))
    incs = sorted({_norm_include(x) for x in (includes or [])})
    if not cids and not incs:
        raise SystemExit("至少给一个 --cluster-id 或 --include")
    # §3.4：重跑按规范化组合 (sorted(cluster_ids), sorted(includes)) 比对；相同幂等，不同报错
    prior = next((e for e in m["executed_projects"] if e["name"] == name), None)
    if prior and (prior.get("done") or prior.get("copied")):
        reg = (sorted(set(prior.get("cluster_ids", []))), sorted(prior.get("includes", [])))
        if reg != (cids, incs):
            raise SystemExit(f"项目 {name} 已登记组合 cluster_ids={reg[0]} includes={reg[1]}，"
                             f"本次 cluster_ids={cids} includes={incs} 不一致——换个项目名或人工处理")
        if prior.get("done"):
            return "已完成，跳过"
        return f"已复制，待补 claims 后跑 verify：{name}"
    if (len(cids) > 1 or incs) and not (reason or "").strip():
        raise SystemExit("多簇合并或使用 --include 时必须给 --reason \"<分组理由>\"（写入 executed_projects 供审计）")
    by_id = {c["cluster_id"]: c for c in m["clusters"]}
    missing = [c for c in cids if c not in by_id]
    if missing:
        raise SystemExit(f"cluster_id 不存在: {missing}（manifest 里有 {sorted(by_id)[:20]}…）")
    cdec = _cluster_decisions(mdir)
    skipped_clusters = {cid for cid, rec in cdec.items() if rec.get("action") == "skip-cluster"}
    blocked = [c for c in cids if c in skipped_clusters]
    if blocked:
        raise SystemExit(f"簇 {blocked} 已决定整簇不迁（skip-cluster）；要导入先 "
                         f"decide --cluster-id X --action confirm 撤销")
    cands = _candidates(m)
    chosen: dict[str, dict] = {}
    for cid in cids:
        for f in by_id[cid]["files"]:
            chosen[f["path"]] = f
    for inc in incs:  # 路径分量边界：项目A 不命中 项目AB，项目A/会议 不命中 项目A/会议纪要
        hits = [p for p in cands if p == inc or p.startswith(inc + "/")]
        if not hits:
            raise SystemExit(f"--include {inc} 在候选清单里一个都没命中（只认 manifest 簇文件的相对路径）")
        for p in hits:
            chosen[p] = cands[p][0]
    decisions, ignored = _legacy_excludes(_decisions(mdir), cands)
    warn = _legacy_warning(ignored)
    root = Path(m["root"])
    # —— 执行计划（无副作用）——
    plan_skip: list[tuple[dict, str]] = []
    plan_copy: list[dict] = []
    for path in sorted(chosen):
        f = chosen[path]
        why = _skip_reason(f, decisions, cands.get(path, (f, ""))[1] in skipped_clusters)
        if why is None:
            why = _safe_source(root, path)  # §7：include 引入的文件同样复核
        if why:
            plan_skip.append((f, why))
        else:
            plan_copy.append(f)
    if not plan_copy:  # §6：项目有效文件数（续传时已存在且哈希一致的照样算有效）
        raise SystemExit(f"项目 {name} 有效文件数为 0（{len(chosen)} 个文件全部被拦截或剔除："
                         + "、".join(sorted({w for _, w in plan_skip})) + "）——不建目录、不登记" + warn)
    owners = _owners(mdir, m)
    dups = {f["path"]: sorted(owners[str(root / f["path"])] - {name}) for f in plan_copy
            if owners.get(str(root / f["path"]), set()) - {name}}
    if dups and not allow_dup:
        raise SystemExit("一个文件只归一个项目（§3.3），以下文件已被别的项目复制过：\n"
                         + "\n".join(f"- {p} → 已归属 {o}" for p, o in sorted(dups.items()))
                         + "\n确需重复归档请加 --allow-dup（会记录在案）")
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
    # —— 副作用从这里开始 ——
    for d in SKELETON_DIRS + (["09-analytics"] if any(f["klass"] == "data" for f in plan_copy) else []):
        (proj / d).mkdir(parents=True, exist_ok=True)
    if not (proj / "README.md").exists():
        (proj / "README.md").write_text(
            f"# {name}\n\nintake 导入项目。原文件在 {m['root']}，未移动。\n", encoding="utf-8")
    newest = max(f.get("mtime", "") for f in plan_copy)[:10]
    if not (proj / "_status.json").exists():  # bootstrap 第一步就读它，顺序不可颠倒
        _save(proj / "_status.json", {
            "schema_version": 1, "project": name,
            "updated": newest or datetime.date.today().isoformat(),
            # active_prd 无 md 时不写键（schema：可缺省，但出现必须是 string，写 null 过不了 validate）
            "lifecycle": infer_lifecycle(name, {"updated": newest}),
            "notes": "intake 导入" + ("；PRD 未数字化（仅 docx）" if not active_prd else "")})
    for f, why in plan_skip:
        _migrated_line(mdir, str(root / f["path"]), "(跳过)", "", why, "skip", project=name)
    common = _common_dir(sorted(chosen))  # §3.2：以最终文件集的最长公共目录前缀为剥离基准
    for f in plan_copy:
        src = root / f["path"]
        target = proj / KLASS_TARGET[f["klass"]] / PurePosixPath(*PurePosixPath(f["path"]).parts[len(common):])
        renamed_from = None
        if target.exists():
            if target.is_file() and _sha256(target) == _sha256(src):
                continue  # 续传：已复制过
            alt = _renamed_target(target, f["path"], src)
            if alt is None:
                continue  # 续传：消歧名下已有同内容副本
            renamed_from, target = target.relative_to(proj).as_posix(), alt
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
        _migrated_line(mdir, str(src), target.relative_to(proj).as_posix(), _sha256(target),
                       decisions.get(f["path"], {}).get("action", "confirm"), "copy", project=name,
                       renamed_from=renamed_from, allow_dup=True if f["path"] in dups else None,
                       dup_of=dups.get(f["path"]))
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
    entry = {"name": name, "cluster_ids": cids, "includes": incs, "files": [f["path"] for f in plan_copy],
             "reason": (reason or "").strip() or None, "copied": True,
             "ts": datetime.datetime.now().isoformat(timespec="seconds")}
    if dups:
        entry["allow_dup"] = sorted(dups)
    m["executed_projects"].append(entry)
    _save(mpath, m)
    return (("续传完成" if resuming else "项目落盘完成")
            + f"：{name}（{len(plan_copy)} 个文件，跳过 {len(plan_skip)}；baseline 已建，待 Claude 补 claims 后跑 verify）"
            + warn)


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


def cmd_decide(mpath: str, path: str | None, action: str, final_name: str | None = None,
               cluster_id: str | None = None) -> str:
    """I4：每确认一项立即追加一行 decisions.jsonl（中断不丢；同一路径/同一簇以最后一条为准）。
    §4：exclude 只收候选清单里的文件路径（目录前缀/不存在的路径拒绝，整簇不迁用 skip-cluster）；
    skip-cluster 只认 --cluster-id；confirm 也可对 --cluster-id 用，表示撤销该簇的 skip-cluster。
    其余（confirm 文件 / rename / skip / install-skill）路径语义不变，不做候选校验。"""
    if action not in DECIDE_ACTIONS:
        raise SystemExit(f"action 非法: {action}")
    if (path is None) == (cluster_id is None):
        raise SystemExit("--path 与 --cluster-id 必须且只能给一个")
    if action == "rename" and not final_name:
        raise SystemExit("rename 必须给 --final-name")
    if final_name is not None and final_name != sanitize_name(final_name):
        raise SystemExit(f"final_name 未过 sanitize: {final_name!r}（应为 {sanitize_name(final_name)!r}）")
    m = _load(Path(mpath))
    if cluster_id is not None:
        if action not in CLUSTER_ACTIONS:
            raise SystemExit(f"--cluster-id 只能配 {'/'.join(CLUSTER_ACTIONS)}，不能配 {action}")
        if cluster_id not in {c["cluster_id"] for c in m["clusters"]}:
            raise SystemExit(f"cluster_id 不存在: {cluster_id}")
    elif action == "skip-cluster":
        raise SystemExit("skip-cluster 只认 --cluster-id（整簇不迁）；单个文件用 --path X --action exclude")
    elif action == "exclude" and path not in _candidates(m):
        raise SystemExit(f"exclude 只接受候选清单里的文件路径: {path}——"
                         f"目录前缀不再整棵跳过；整簇不迁用 --cluster-id X --action skip-cluster")
    rec = {"ts": datetime.datetime.now().isoformat(timespec="seconds"), "path": path,
           "action": action, "final_name": final_name}
    if cluster_id is not None:
        rec["cluster_id"] = cluster_id
    with (Path(mpath).parent / "decisions.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    what = path if path is not None else f"簇 {cluster_id}"
    return f"已记录：{action} {what}" + (f" → {final_name}" if final_name else "")


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
    """§5：按文件对账。manifest 每个候选文件归入一类——已迁（某项目 copy 过）/ 已决定不迁（exclude、
    skip-cluster、默认拦截的凭证/超大/隐藏/云端占位、复制时拒绝的 symlink 等）/ 未决定（其余）。
    簇级计数只作展示：簇内文件全部已迁或不迁才算已处理。另列已 copy 未 verify 的项目数。"""
    mpath = Path(mpath); m = _load(mpath); mdir = mpath.parent
    m["stage"] = "done"; _save(mpath, m)
    root = Path(m["root"])
    cands = _candidates(m)
    decisions, ignored = _legacy_excludes(_decisions(mdir), cands)
    skipped_clusters = {cid for cid, rec in _cluster_decisions(mdir).items() if rec.get("action") == "skip-cluster"}
    copied, refused = set(), set()
    for rec in _read_jsonl(mdir / "migrated.jsonl"):
        if rec.get("action") == "copy":
            copied.add(rec["source_abs"])
        elif rec.get("action") == "skip":
            refused.add(rec["source_abs"])
    for e in m["executed_projects"]:
        copied.update(str(root / rel) for rel in e.get("files", []))
    state: dict[str, str] = {}
    for path, (f, cid) in cands.items():
        src = str(root / path)
        if src in copied:
            state[path] = "迁"
        elif src in refused or _skip_reason(f, decisions, cid in skipped_clusters):
            state[path] = "不迁"
        else:
            state[path] = "未决定"
    n = {k: sum(1 for v in state.values() if v == k) for k in ("迁", "不迁", "未决定")}
    pending = sum(1 for c in m["clusters"] if any(state[f["path"]] == "未决定" for f in c["files"]))
    unverified = sum(1 for e in m["executed_projects"] if e.get("copied") and not e.get("done"))
    skills = sum(1 for rec in _read_jsonl(mdir / "migrated.jsonl") if rec.get("action") == "install-skill")
    return (f"intake 完成：迁 {n['迁']} / 不迁 {n['不迁']} / 未决定 {n['未决定']}（按候选文件计）；"
            f"已 copy 未 verify 的项目 {unverified} 个；未处理簇 {pending}；装载 skill {skills} 个；"
            f"原文件未动，后续修改不会自动同步" + _legacy_warning(ignored))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("project"); p1.add_argument("--manifest", required=True)
    p1.add_argument("--cluster-id", action="append", default=[])  # §3.1：可缺省、可重复（多簇合并）
    p1.add_argument("--include", action="append", default=[],
                    help="候选清单里的相对路径（文件或目录前缀，按路径分量匹配），可重复")
    p1.add_argument("--reason", default=None, help="多簇合并或用了 --include 时必填：分组理由")
    p1.add_argument("--allow-dup", action="store_true", help="放行已被别的项目复制过的文件（记录在案）")
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
    p6.add_argument("--path", default=None, help="文件路径（exclude 只收候选清单里的文件）")
    p6.add_argument("--cluster-id", default=None, help="整簇决策：skip-cluster（不迁）/ confirm（撤销）")
    p6.add_argument("--action", required=True, choices=DECIDE_ACTIONS)
    p6.add_argument("--final-name", default=None)
    for sp in (p1, p4):
        sp.add_argument("--repo", default=str(ROOT), help=argparse.SUPPRESS)  # 测试注入假仓
    args = ap.parse_args()
    if args.cmd == "verify":
        print(cmd_verify(args.manifest, args.name, Path(args.repo)))
    elif args.cmd == "stage":
        print(cmd_stage(args.manifest, args.to))
    elif args.cmd == "decide":
        print(cmd_decide(args.manifest, args.path, args.action, args.final_name, args.cluster_id))
    elif args.cmd == "project":
        print(cmd_project(args.manifest, args.cluster_id, args.name, args.active_prd, Path(args.repo),
                          includes=args.include, reason=args.reason, allow_dup=args.allow_dup))
    elif args.cmd == "skill":
        print(cmd_skill_from_manifest(args.manifest, args.path, args.name, Path(args.repo)))
    else:
        print(cmd_finish(args.manifest))
    return 0


if __name__ == "__main__":
    sys.exit(main())
