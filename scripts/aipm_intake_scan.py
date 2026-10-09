#!/usr/bin/env python3
"""intake 阶段①扫描器——只读盘点，绝不写用户目录。

产出 manifest.json 与人读 report.md。分工铁律：存在性判断在本脚本（可回归），
归属判断留给 Claude（读簇摘要+抽样，见 ai-pm-intake/SKILL.md）。
"""
from __future__ import annotations
import argparse, datetime, hashlib, json, os, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# 排除表（spec §2）。目录名级；隐藏目录一律排除。隐藏文件照扫（.env/.zsh_history 要做凭证探测），
# 但标 hidden=true、永不迁移（C2-1）
EXCLUDE_DIR_NAMES = {"node_modules", ".git", "dist", "build", "__pycache__", ".venv", "venv", ".Trash",
                     # I5：真实 macOS 主目录里的环境/依赖/构建产物
                     "miniconda3", "anaconda3", "site-packages", "target", "Pods", "vendor", ".cache"}
# I5：macOS 包目录（Finder 里看着是一个文件，里面是成千上万的内部文件）
EXCLUDE_DIR_SUFFIXES = (".photoslibrary", ".app", ".bundle", ".framework", ".xcodeproj")
SF_DATALESS = 0x40000000  # macOS st_flags：iCloud「优化存储」只留占位、内容在云端，读一下就触发下载
EXCLUDE_HOME_PARTS = {"Library", "Applications", "Movies", "Music"}  # 仅扫描根=主目录时生效
JUNK_FILE_RE = re.compile(r"^(\.DS_Store|Thumbs\.db)$|^~\$")
CRED_NAME_RE = re.compile(r"(^\.env$|^\.env\.[^.]+$|credentials|id_rsa|\.pem$|^\.netrc$|^\.npmrc$"
                          r"|^\.pgpass$|^\.pypirc$|_history$|^\.git-credentials$)", re.I)
# 内容探测面（C2-3）：文本类配置/脚本，均限 < 2MB
CONTENT_PROBE_EXTS = {".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".cfg", ".env",
                      ".sh", ".zsh", ".bash", ".py", ".js", ".ts", ".properties", ".xml"}
CRED_CONTENT_RES = [re.compile(p) for p in (
    r"sk-[A-Za-z0-9]{20,}", r"pat_[A-Za-z0-9]{10,}",
    r"(?i)(api[_-]?key|secret|token)\s*[:=]\s*['\"]?[A-Za-z0-9]{16,}")]
KLASS_BY_EXT = {".md": "md", ".markdown": "md", ".html": "html", ".htm": "html",
                ".docx": "docx", ".doc": "docx", ".xlsx": "data", ".xls": "data", ".csv": "data",
                ".pptx": "ppt", ".ppt": "ppt",
                # 已归属项目但类型不明的文档 → 07-references/intake-raw/（spec §4「拿不准的」）
                ".txt": "doc", ".pdf": "doc", ".rtf": "doc"}
ILLEGAL_NAME_RE = re.compile(r'[\\/:*?"<>|]+')  # 连续非法字符合并为一个 -
BIG_CLUSTER = 200  # 簇文件数超过此值且含子目录 → 按直接子目录下切（C1 自适应切簇）
MAX_CLUSTER_DEPTH = 4  # 相对扫描根最多切到第 4 层；封顶仍超阈值才标 big
ROOT_LOOSE_LABEL = "(根目录散文件)"  # 扫描根直放文件的簇名（不用 "."：sanitize 后会指向 projects 目录本身）

SCHEMA = """
manifest 字段（Task 2 apply 按此消费）：
stage: scan|confirm|exec|done（confirm/exec 走 apply stage 子命令置位；done 由 finish 置位）
scope: {scanned_dirs[], excluded{原因:计数}, total_files, skipped_unreadable}
clusters[]: {cluster_id, source_dirs[], suggested_name, loose:bool, files[{path,ext,size,sha256?,klass,credential_hit,oversize,mtime}], newest_mtime, big:bool}
  —— source_dirs[0] 是多段相对前缀（自适应切簇）；loose=True 表示只含该目录直放的散文件
  —— path 为扫描根下相对路径；可选 hidden/unreadable/dataless 标记。sha256 只对会迁移的候选算
  —— 执行默认跳过：credential_hit/oversize（用户逐个 decide confirm 该文件路径才例外纳入）、
     hidden/unreadable/dataless/klass=unclassified（一律跳过，无例外）
skill_candidates[]: {path,name,frontmatter_ok,collisions[],status: installable|rename|skip}
prompt_assets[]: {path,note}
unclassified[]: {path,ext,size}
dataless[]: iCloud 云端未下载的占位文件路径（不读内容，apply 跳过）
duplicates[]: {size,sha256,paths[]}
project_name_conflicts[]: 建议名撞 output/projects/ 已有项目
decisions_file: "decisions.jsonl"——确认决策不进 manifest，走 apply decide 逐行追加到同目录
  {ts,path,action: confirm|rename|exclude|skip|install-skill,final_name}；同一路径以最后一条为准
executed_projects[]: {cluster_ids[],name,copied:true,ts,done?:true,verified_at?}——project 写 copied，
  verify（契约 + validate）通过才写 done
"""


def is_aipm_repo(d: Path) -> bool:
    """仓库根判定（spec §2）：CLAUDE.md 与 .claude/skills/ai-pm/ 并存，整棵排除。"""
    return (d / "CLAUDE.md").is_file() and (d / ".claude" / "skills" / "ai-pm").is_dir()


def sanitize_name(name: str) -> str:
    """项目名清洗：去首尾空格、连续非法字符合并一个 -、截 40 字。单源；apply 入口也断言它。"""
    s = ILLEGAL_NAME_RE.sub("-", name.strip()).strip("-")
    return s[:40] or "未命名项目"


def _stat(entry: os.DirEntry) -> os.stat_result:
    """单点取 stat（DirEntry 已缓存，不跟随 symlink）；独立成函数便于测试注入 st_flags。"""
    return entry.stat(follow_symlinks=False)


def _is_dataless(st) -> bool:
    """iCloud 占位文件判定；非 macOS 无 st_flags → False。"""
    return bool(getattr(st, "st_flags", 0) & SF_DATALESS)


def _dir_exclusion(e: os.DirEntry, root: Path, is_home: bool) -> str | None:
    if e.name in EXCLUDE_DIR_NAMES:
        return e.name
    if e.name.startswith("."):
        return "隐藏目录"
    suffix = next((sfx for sfx in EXCLUDE_DIR_SUFFIXES if e.name.endswith(sfx)), None)
    if suffix:
        return suffix
    if is_home and Path(e.path).parent == root and e.name in EXCLUDE_HOME_PARTS:
        return e.name
    if is_aipm_repo(Path(e.path)):
        return "aipm-repo"
    return None


def _iter_files(root: Path, excluded: dict[str, int]):
    """os.scandir 递归（I5：DirEntry 的 is_dir/is_file/is_symlink/stat 复用缓存）：不跟随 symlink；
    排除表计数；不可读与坏 symlink 计 skipped 不中断；每 5000 文件打进度行。"""
    is_home = root == Path.home().resolve()
    stack, n = [str(root)], 0
    while stack:
        d = stack.pop()
        try:
            with os.scandir(d) as it:
                entries = list(it)
        except OSError:
            yield {"_skipped_dir": d}
            continue
        for e in entries:
            try:
                if e.is_symlink():
                    if not os.path.exists(e.path):  # 坏 symlink：计 skipped（C3）；好 symlink 不跟随、静默略过
                        yield {"_skipped_dir": e.path}
                    continue
                if e.is_dir(follow_symlinks=False):
                    reason = _dir_exclusion(e, root, is_home)
                    if reason:
                        excluded[reason] = excluded.get(reason, 0) + 1
                        continue
                    stack.append(e.path)
                elif e.is_file(follow_symlinks=False):
                    if JUNK_FILE_RE.match(e.name):
                        excluded["垃圾文件"] = excluded.get("垃圾文件", 0) + 1
                        continue
                    n += 1
                    if n % 5000 == 0:
                        print(f"…已枚举 {n} 文件", file=sys.stderr)
                    st = _stat(e)
                    yield {"path": Path(e.path), "size": st.st_size, "mtime": st.st_mtime,
                           "dataless": _is_dataless(st)}
            except OSError:
                yield {"_skipped_dir": e.path}


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _skill_collisions(name: str, extra_skill_dirs=None) -> list[str]:
    """撞名检测面 = registry 条目 ∪ 项目级 .claude/skills/* ∪ 用户级 ~/.claude/skills ∪ 注入目录。

    extra_skill_dirs=None（生产默认）：含用户级 ~/.claude/skills；
    extra_skill_dirs=() （测试显式传空）：固定空注入面，不绑本机状态；
    非空 tuple：注入目录 + 用户级（显式注入时同样要看用户级撞名）。
    """
    hits = []
    reg = ROOT / "templates/configs/capability-registry.json"
    if reg.is_file():
        data = json.loads(reg.read_text(encoding="utf-8"))
        for cap in data.get("capabilities", []):
            if cap.get("skill") == name or f"/{name}" in (cap.get("legacy_commands") or []):
                hits.append(f"registry:{cap.get('id')}")
    if extra_skill_dirs is None:
        dirs = [ROOT / ".claude/skills", Path.home() / ".claude/skills"]
    elif extra_skill_dirs == ():
        dirs = [ROOT / ".claude/skills"]
    else:
        dirs = [ROOT / ".claude/skills", *(Path(d) for d in extra_skill_dirs),
                Path.home() / ".claude/skills"]
    for base in dirs:
        if (base / name).is_dir():
            hits.append(f"disk:{base}")
    return hits


def will_migrate(f: dict) -> bool:
    """默认会被迁移的文件（apply 与 copy_bytes 预估共用口径）。凭证/超大可经用户逐个 confirm 例外纳入。"""
    return not (f.get("credential_hit") or f.get("oversize") or f.get("hidden") or f.get("unreadable")
                or f.get("dataless") or f.get("klass") == "unclassified")


def _build_clusters(raw: list[dict], big_cluster: int) -> list[dict]:
    """自适应切簇（C1）：先按一级目录归簇；文件数 > big_cluster 且含子目录的簇，按直接子目录递归下切，
    直到 ≤ 阈值或相对扫描根 MAX_CLUSTER_DEPTH 层。每层目录里的散文件单独成簇（loose=True），
    source_dirs[0] 就是该目录的相对路径（多段，如 Documents/项目B）；apply 按此前缀剥离保留子路径。"""
    out: list[dict] = []

    def emit(prefix: str, files: list[dict], loose: bool, big: bool) -> None:
        last = prefix.rsplit("/", 1)[-1]
        out.append({"source_dirs": [prefix], "files": files, "loose": loose, "big": big,
                    "suggested_name": sanitize_name(last),
                    "newest_mtime": max(f["mtime"] for f in files)})

    def split(prefix: str, files: list[dict]) -> None:
        depth = prefix.count("/") + 1
        n = len(prefix) + 1
        direct = [f for f in files if "/" not in f["path"][n:]]
        has_sub = len(direct) < len(files)
        if len(files) <= big_cluster or not has_sub or depth >= MAX_CLUSTER_DEPTH:
            emit(prefix, files, False, len(files) > big_cluster and has_sub)
            return
        if direct:
            emit(prefix, direct, True, False)
        subs: dict[str, list[dict]] = {}
        for f in files:
            rest = f["path"][n:]
            if "/" in rest:
                subs.setdefault(prefix + "/" + rest.split("/", 1)[0], []).append(f)
        for sub in sorted(subs):
            split(sub, subs[sub])

    tops: dict[str, list[dict]] = {}
    root_loose = []
    for e in raw:
        if "/" in e["path"]:
            tops.setdefault(e["path"].split("/", 1)[0], []).append(e)
        else:
            root_loose.append(e)
    if root_loose:
        emit(ROOT_LOOSE_LABEL, root_loose, True, False)
    for top in sorted(tops):
        split(top, tops[top])
    out.sort(key=lambda c: (c["source_dirs"][0], not c["loose"]))
    for i, c in enumerate(out, 1):
        c["cluster_id"] = f"c{i:03d}"
    return out


def scan(root: Path, out_root: Path, extra_skill_dirs=None, big_cluster: int = BIG_CLUSTER) -> dict:
    root = root.expanduser().resolve()
    excluded: dict[str, int] = {}
    raw, skipped = [], 0
    for item in _iter_files(root, excluded):
        if "_skipped_dir" in item:
            skipped += 1
            continue
        p: Path = item["path"]
        rel = p.relative_to(root).as_posix()
        ext = p.suffix.lower()
        entry = {"path": rel, "ext": ext, "size": item["size"],
                 "klass": KLASS_BY_EXT.get(ext, "unclassified"),
                 "credential_hit": bool(CRED_NAME_RE.search(p.name)),
                 "hidden": p.name.startswith("."),
                 "oversize": item["size"] > 50 << 20,
                 "mtime": datetime.datetime.fromtimestamp(item["mtime"]).isoformat(timespec="seconds")}
        if item.get("dataless"):  # I5：云端占位不读内容（不探测、不哈希），apply 跳过
            entry["dataless"] = True
        elif not entry["credential_hit"] and ext in CONTENT_PROBE_EXTS and entry["size"] < (2 << 20):
            try:
                text = p.read_text(encoding="utf-8", errors="ignore")
                entry["credential_hit"] = any(r.search(text) for r in CRED_CONTENT_RES)
            except OSError:
                entry["unreadable"] = True
                skipped += 1
        raw.append(entry)

    # 去重：只对「会迁移的候选」做（I5：超大/凭证/隐藏/未归类/云端占位/不可读都不哈希，
    # 全盘扫描时这几类占了绝大多数字节）；同 size 分组才哈希；size=0 的空文件直接成组不哈希
    by_size: dict[int, list[dict]] = {}
    for e in raw:
        if will_migrate(e):
            by_size.setdefault(e["size"], []).append(e)
    dup_groups = []
    for size, group in by_size.items():
        if len(group) < 2:
            continue
        if size == 0:
            dup_groups.append({"size": 0, "sha256": "", "paths": [e["path"] for e in group]})
            continue
        for e in group:
            try:
                e["sha256"] = _sha256(root / e["path"])
            except OSError:  # C3：不可读不中断，计 skipped，apply 跳过
                e["unreadable"] = True
                skipped += 1
        by_hash: dict[str, list[str]] = {}
        for e in group:
            if "sha256" in e:
                by_hash.setdefault(e["sha256"], []).append(e["path"])
        dup_groups += [{"size": size, "sha256": h, "paths": ps} for h, ps in by_hash.items() if len(ps) > 1]

    cluster_list = _build_clusters(raw, big_cluster)

    # skill 候选与 prompt 资产（含 frontmatter 头判定）
    skill_candidates, prompt_assets = [], []
    for c in cluster_list:
        for f in c["files"]:
            p = root / f["path"]
            if f.get("unreadable") or f.get("dataless"):
                continue
            if p.name == "SKILL.md":
                name = p.parent.name
                try:
                    front = p.read_text(encoding="utf-8", errors="ignore")
                except OSError:  # C3
                    f["unreadable"] = True; skipped += 1
                    continue
                parts = front.split("---", 2)
                ok = front.lstrip().startswith("---") and len(parts) >= 3 and "description:" in parts[1]
                col = _skill_collisions(name, extra_skill_dirs)
                skill_candidates.append({"path": f["path"], "name": name, "frontmatter_ok": ok,
                                         "collisions": col, "status": "skip" if not ok else ("rename" if col else "installable")})
            elif f["klass"] == "md" and f["size"] < (1 << 20):
                try:
                    head = p.read_text(encoding="utf-8", errors="ignore")[:600]
                except OSError:  # C3
                    f["unreadable"] = True; skipped += 1
                    continue
                if re.search(r"你是一位|You are a|请按以下流程|#\s*系统提示词", head):
                    prompt_assets.append({"path": f["path"], "note": "疑似 prompt/规则文档"})

    projects = ROOT / "output/projects"
    existing = {p.name for p in projects.glob("*") if p.is_dir()} if projects.is_dir() else set()
    conflicts = sorted({c["suggested_name"] for c in cluster_list if c["suggested_name"] in existing})

    copy_bytes = sum(f["size"] for c in cluster_list for f in c["files"] if will_migrate(f))
    manifest = {
        "schema_version": 1, "intake_id": time.strftime("%Y%m%d-%H%M%S"),
        "root": str(root), "stage": "scan",
        "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "scope": {"scanned_dirs": [str(root)], "excluded": excluded,
                  "total_files": len(raw), "skipped_unreadable": skipped,
                  "copy_bytes_estimate": copy_bytes},
        "clusters": cluster_list, "skill_candidates": skill_candidates,
        "prompt_assets": prompt_assets,
        "unclassified": [e for e in raw if e["klass"] == "unclassified"],
        "duplicates": dup_groups, "project_name_conflicts": conflicts,
        "dataless": [e["path"] for e in raw if e.get("dataless")],
        "decisions_file": "decisions.jsonl", "executed_projects": [],
    }
    intake_dir = _mkdir_numbered(out_root, manifest["intake_id"])  # 同秒撞名：加序号重试（spec §3）
    manifest["credential_hits"] = [f["path"] for c in cluster_list for f in c["files"] if f["credential_hit"]]
    (intake_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    _write_report(intake_dir, manifest, root, len(raw), skipped, copy_bytes)
    return manifest


def _mkdir_numbered(out_root: Path, base_id: str) -> Path:
    """原子 mkdir；同秒撞名按 -2/-3 递增重试（不共用目录——两个并发 scan 会互相覆盖 manifest）。"""
    candidate = out_root / base_id
    for i in range(2, 100):
        try:
            candidate.mkdir(parents=True)
            return candidate
        except FileExistsError:
            candidate = out_root / f"{base_id}-{i}"
    raise SystemExit("intake 时间戳目录冲突过多，重试later")


def _write_report(intake_dir: Path, m: dict, root: Path, n_files: int, skipped: int, copy_bytes: int) -> None:
    cred_lines = "\n".join(f"- {p}" for p in m["credential_hits"]) or "-（无）"
    excl = "、".join(f"{k}×{v}" for k, v in m["scope"]["excluded"].items()) or "无"
    lines = [
        "# intake 盘点报告", "",
        "## 扫描范围", "",
        f"- 扫描根：`{root}`；命中文件 {n_files}；不可读跳过 {skipped}",
        f"- 排除：{excl}",
        f"- **复制总量预估：{copy_bytes / (1 << 20):.1f} MB**（执行前确认才开跑；原文件不动，目标盘需有余量）", "",
        f"## 疑似项目（{len(m['clusters'])} 簇）", "",
    ]
    for c in m["clusters"]:
        klasses: dict[str, int] = {}
        for f in c["files"]:
            klasses[f["klass"]] = klasses.get(f["klass"], 0) + 1
        big = " ⚠️巨型簇：切到深度上限仍超阈值，内部可能含多个项目，抽样时注意区分" if c["big"] else ""
        tag = "（散文件）" if c.get("loose") else ""
        lines.append(f"- **{c['source_dirs'][0]}**{tag}（{c['cluster_id']}，建议名 {c['suggested_name']}）：{len(c['files'])} 文件 {klasses}，最新 {c['newest_mtime'][:10]}{big}")
    lines += ["", f"## skill 候选（{len(m['skill_candidates'])}）", ""]
    lines += ([f"- {s['name']}：{s['status']}" + (f"，撞名 {s['collisions']}" if s["collisions"] else "")
               for s in m["skill_candidates"]] or ["-（无）"])
    lines += ["", f"## prompt/规则资产（{len(m['prompt_assets'])}）", ""]
    lines += ([f"- {a['path']}：{a['note']}" for a in m["prompt_assets"]] or ["-（无）"])
    lines += ["", f"## 未归类（{len(m['unclassified'])}，默认不迁移）", ""]
    lines += ([f"- {u['path']}" for u in m["unclassified"][:20]] or ["-（无）"])
    lines += ["", f"## 云端未下载文件（{len(m['dataless'])}，iCloud 占位，未读取、不迁移；需要的话先在 Finder 里下载再重扫）", ""]
    lines += ([f"- {p}" for p in m["dataless"][:50]] or ["-（无）"])
    lines += ["", "## 凭证命中（默认跳过，显式确认才迁）", "", cred_lines,
              "", f"## 重复文件组（{len(m['duplicates'])}）", ""]
    (intake_dir / "report.md").write_text("\n".join(lines), encoding="utf-8")


def list_unfinished(out_root: Path) -> list[str]:
    """重跑发现（spec §7）：列 stage != done 的 manifest，供主命令提示续跑。"""
    result = []
    if out_root.is_dir():
        for p in sorted(out_root.glob("*/manifest.json")):
            try:
                if json.loads(p.read_text(encoding="utf-8")).get("stage") != "done":
                    result.append(str(p))
            except (OSError, ValueError):
                continue
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("scan"); sp.add_argument("--root", default="~"); sp.add_argument("--out", default="output/_intake")
    up = sub.add_parser("unfinished"); up.add_argument("--out", default="output/_intake")
    args = ap.parse_args()
    out_root = ROOT / args.out
    if args.cmd == "unfinished":
        for p in list_unfinished(out_root):
            print(p)
        return 0
    m = scan(Path(args.root), out_root)
    print(json.dumps({"manifest": str(out_root / m["intake_id"] / "manifest.json"),
                      "clusters": len(m["clusters"]), "skills": len(m["skill_candidates"]),
                      "unclassified": len(m["unclassified"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
