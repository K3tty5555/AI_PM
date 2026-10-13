#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI_PM 打包器（作者侧工具）。

按 git ls-files 收集文件——绝不用排除法。
实测教训：「去掉 output 后的目录」是 926 MB，其中 .ai-shared/conversations/raw/*.jsonl
单文件 104 MB、前十合计 380 MB，那是作者的真实对话记录。用排除法打包会直接发出去。

用法：
    python3 scripts/aipm_package.py --kind private --out ~/Downloads
    python3 scripts/aipm_package.py --kind public            # 默认写到 <仓库>/dist/public/AI_PM.zip
产物：<out>/AI_PM.zip。zip 根平铺，双击解压即一个能用的 AI_PM 文件夹；升级材料在 .aipm-dist/。
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import json
import os
import hashlib
import re
import subprocess
import sys
import time
import unicodedata
import zipfile
from pathlib import Path, PureWindowsPath

ROOT = Path(__file__).resolve().parents[1]

DIST = ".aipm-dist"
PACKAGE_NAME = "AI_PM.zip"
IGNORE_FILE = ".ignore"
# ripgrep 在没有 git 的目录里也认 .ignore：Claude 搜规则时不会搜到历史原件里的旧版 SKILL.md
IGNORE_CONTENT = "/.aipm-dist/\n"
VERSIONS_SCHEMA = 2
# 版本号会被开场脚本用 sed 从 versions.json 里截出来显示给用户：引号、反斜杠、换行都会让它截错。
# 打包器和校验器共用这一条（2026-10-13，验收 R-01）
VERSION_PATTERN = re.compile(r"[0-9A-Za-z][0-9A-Za-z._+-]{0,63}")


def version_ok(version: object) -> bool:
    return isinstance(version, str) and VERSION_PATTERN.fullmatch(version) is not None

DIST_README = (
    "# .aipm-dist\n\n"
    "这里是 AI_PM 的升级材料（版本号、文件清单、历史原件），不是规则来源。\n"
    "查规则、读规范请看根目录的 CLAUDE.md 和 .claude/skills/，不要引用这里的内容。\n"
)
# Windows 路径上限 260，给 C:\Users\<名字>\Downloads\AI_PM\ 留余量；打包器与校验器共用
MAX_PATH_CHARS = 180
MAX_SEGMENT_BYTES = 255
PROBE_COUNT = 20
_WIN_ILLEGAL = re.compile(r'[<>:"|?*\\\x00-\x1f]')
_WIN_RESERVED = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$", re.IGNORECASE)

# 私有版额外携带的路径（相对仓库根，可为文件或目录前缀）
PRIVATE_EXTRA = [
    ".claude/skills/xfchat-wiki/",
    ".claude/skills/tpd_cli/",
    ".claude/skills/d2c/",
    ".claude/skills/d2c-analyze/",
    ".claude/skills/d2c-codegen/",
    ".claude/skills/d2c-fetch/",
    ".claude/skills/d2c-setup/",
    "vendor/",
    "templates/knowledge-base/",
    "templates/persona/",
    "scripts/.share-denylist",
    "scripts/.metrics-dict.md",
    "output/assets/教育BG原Wiki知识库/",
    "output/assets/AI_PM知识库蒸馏-20260902/",
    "output/assets/_inventory/",
]
# 本机私有携带配置（gitignore，模板 scripts/.private-bundle.example.json）。
# 含内部平台名的技能只能写在这里：写进本文件会随公开仓库发出去（check-share-readiness 会拦）。
PRIVATE_BUNDLE_CONF = ROOT / "scripts" / ".private-bundle.json"


def _load_private_bundle_conf(path: Path) -> tuple[dict[str, Path], tuple[str, ...]]:
    """读本机私有携带配置 → (包内路径 → 来源目录, 额外的私有包关键文件)。没有配置文件返回空。"""
    if not path.is_file():
        return {}, ()
    try:
        conf = json.loads(path.read_text(encoding="utf-8"))
        mapped = conf.get("mapped", {})
        sentinels = conf.get("sentinels", [])
        if not isinstance(mapped, dict) or not isinstance(sentinels, list):
            raise ValueError("mapped 应为对象、sentinels 应为列表")
        for key in mapped:
            if not key.endswith("/") or key.startswith("/") or ".." in key.split("/"):
                raise ValueError(f"mapped 的包内路径要是相对目录、以 / 结尾：{key!r}")
    except (ValueError, AttributeError) as exc:
        raise SystemExit(f"⛔ {path} 格式不对：{exc}")
    return {k: Path(os.path.expanduser(v)) for k, v in mapped.items()}, tuple(sentinels)


_LOCAL_MAPPED, _LOCAL_SENTINELS = _load_private_bundle_conf(PRIVATE_BUNDLE_CONF)

# 私有版从本机个人目录拷进包的目录：包内路径 → 来源。正本留在个人目录，项目里不放副本。
# 收包的同事多半不会自己装这些（用户 2026-10-12 拍板）。
PRIVATE_MAPPED = {
    **_LOCAL_MAPPED,
    # metrics-query 天生装在个人目录（密钥写那里、也自动更新到那里）：包里只放安装件，
    # 同事第一次查数据时由 Claude 拷到 ~/.claude/skills/（见 CLAUDE.md「查业务数据」）
    "templates/personal-skills/metrics-query/": Path.home() / ".claude/skills/metrics-query",
}
# 拷映射目录时跳过：个人密钥（.env）、系统噪声
_MAPPED_SKIP = re.compile(r"^(\.env(\..*)?|\.DS_Store)$")
# 私有版由打包器生成的文件：包内路径 → 内容
PRIVATE_GENERATED = {
    # Playwright 走项目级 MCP，不走官方插件：插件要从 GitHub 装，公司网络常连不上。
    # 用本机已装的 Chrome，免得再下载浏览器；跑过一次后 npx 缓存里有 playwright-core，依赖它的私有技能也能找到。
    ".mcp.json": json.dumps({"mcpServers": {"playwright": {
        "command": "npx", "args": ["-y", "@playwright/mcp@latest", "--browser", "chrome"]}}},
        ensure_ascii=False, indent=2) + "\n",
    "templates/personal-skills/README.md": (
        "# 个人目录技能安装件\n\n"
        "这里的技能要装在个人目录 `~/.claude/skills/` 才能正常用：它们把密钥存在那里，也会自动更新到那里。\n\n"
        "第一次要用时，Claude 会把整个文件夹拷到 `~/.claude/skills/`（规则见根目录 CLAUDE.md「查业务数据」那条），"
        "也可以自己手动拷。\n\n"
        "- `metrics-query`：查业务数据。第一次用会引导你到数据平台申请自己的 API Key 再粘贴进来。\n"
    ),
}
# 私有包必须带的关键文件：校验器据此确认「私有包没少打」
PRIVATE_SENTINELS = (
    ".claude/skills/tpd_cli/SKILL.md",
    ".claude/skills/xfchat-wiki/SKILL.md",
    "scripts/.metrics-dict.md",
    "templates/personal-skills/metrics-query/SKILL.md",
    ".mcp.json",
    *_LOCAL_SENTINELS,
)
# 这两个模板目录公共包里也有骨架（README.md / .gitkeep），里面的卡片才是私有
_SKELETON_DIRS = ("templates/knowledge-base/", "templates/persona/")


def is_private_only(rel: str) -> bool:
    """公共包里绝不该出现的路径。校验器从这里导入，不另抄一份。
    忽略大小写：Mac / Windows 文件系统不分大小写，Vendor/ 解压后就是 vendor/。"""
    low = rel.lower()
    for prefix in [*PRIVATE_EXTRA, *PRIVATE_MAPPED, *PRIVATE_GENERATED]:
        p = prefix.lower()
        if p in _SKELETON_DIRS and low.startswith(p):
            return low.rsplit("/", 1)[-1] not in ("readme.md", ".gitkeep")
        if low == p or (p.endswith("/") and low.startswith(p)):
            return True
    return False


# 任何版本都不得携带的路径（安全线）
NEVER_INCLUDE = [
    "output/projects/",
    "output/_archive/",
    "output/backups/",
    "output/sharing/",
    "output/weekly/",
    ".claude/projects/",
    ".claude/settings.local.json",
    "templates/configs/capability-registry.local",  # 本机注册表：外部 skill 名，跟着安装目录走（Ruling 13）
    ".d2c/",
    ".aipm-dist/",  # 打包器生成，仓库里不许有被跟踪的同名路径
    ".ai-shared/conversations/",
    ".ai-shared/memory-snapshots/",
    "docs/",
]


def _git_tracked(root: Path) -> list[str]:
    """返回 git tracked 文件列表（仓库根相对路径，正斜杠）。"""
    out = subprocess.run(
        ["git", "-C", str(root), "-c", "core.quotepath=off", "ls-files"],
        capture_output=True, text=True, check=True,
    ).stdout
    return [line for line in out.splitlines() if line]


def _walk_dir(root: Path, rel: str) -> list[str]:
    """收集目录下所有普通文件（跳过符号链接）。

    缺失直接失败：少打一整块资源比打包失败更糟（以前只打警告，「少了还以为 OK」）。
    """
    base = root / rel
    if not base.exists():
        raise SystemExit(f"⛔ 私有版额外路径 {rel} 不存在（PRIVATE_EXTRA 拼错，或这台机器没有私有资料）")
    if not base.is_dir():
        raise SystemExit(f"⛔ 私有版额外路径 {rel} 不是目录")
    found = []
    for p in base.rglob("*"):
        if p.is_symlink() or not p.is_file():
            continue
        rel = p.relative_to(root)
        # 分发形态不带 git 元数据：私有 skill 若是 git clone，其 .git 目录是内部仓库
        # 完整历史，混进包等于把嵌套 git 仓库发到用户机器上（2026-10-10 实测踩过）。
        # .git 文件（worktree 指针）一并跳过；.gitignore/.github 等同名邻居不受影响。
        if ".git" in rel.parts:
            continue
        found.append(rel.as_posix())
    return found


def _mapped_files() -> dict[str, Path]:
    """私有版映射目录展开成 包内路径 → 来源文件。来源缺失直接失败（同 _walk_dir）。"""
    found: dict[str, Path] = {}
    for prefix, src in PRIVATE_MAPPED.items():
        src = Path(src)
        if not src.is_dir():
            raise SystemExit(f"⛔ 私有版要带的 {prefix} 来源 {src} 不存在或不是目录（这台机器没装它？）")
        for p in sorted(src.rglob("*")):
            if p.is_symlink() or not p.is_file():
                continue
            rel = p.relative_to(src)
            if ".git" in rel.parts or "__pycache__" in rel.parts or _MAPPED_SKIP.match(p.name):
                continue
            found[prefix + rel.as_posix()] = p
    return found


def git_blob_id(data: bytes) -> str:
    """git blob sha1 的前 12 位，与 history/ 的命名一致。"""
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\x00" + data).hexdigest()[:12]


def content_digest(blobs: dict[str, str]) -> str:
    """全部安装文件「路径 + blob」排序后的哈希。私有资料不在 git 里，同一提交下靠它区分新旧。"""
    h = hashlib.sha256()
    for path in sorted(blobs):
        h.update(f"{path}\0{blobs[path]}\n".encode("utf-8"))
    return h.hexdigest()[:16]


def path_problems(n: str) -> list[str]:
    """路径本身的问题：穿越、绝对路径、Windows 解不开的名字、过长。打包器和校验器共用。"""
    problems = []
    win = PureWindowsPath(n)
    if not n or n.startswith("/") or win.drive or win.is_absolute():
        problems.append(f"非法路径（绝对路径）：{n}")
    parts = n.rstrip("/").split("/")
    if any(p in ("", ".", "..") for p in parts):
        problems.append(f"非法路径（穿越或空段）：{n}")
    for seg in parts:
        if len(seg.encode("utf-8")) > MAX_SEGMENT_BYTES:
            problems.append(f"单段超过 {MAX_SEGMENT_BYTES} 字节：{n}")
            break
        if seg not in (".", "..") and (_WIN_ILLEGAL.search(seg) or seg.endswith((".", " "))
                                       or _WIN_RESERVED.match(seg)):
            problems.append(f"Windows 上解压不了的名字：{n}")
            break
    if len(n) > MAX_PATH_CHARS:
        problems.append(f"路径过长（{len(n)} > {MAX_PATH_CHARS} 字符，Windows 可能解压失败）：{n}")
    return problems


def _path_key(n: str) -> str:
    return unicodedata.normalize("NFC", n.rstrip("/")).casefold()


def duplicate_problems(paths: list[str]) -> list[str]:
    """解压到大小写不敏感 / 归一化 Unicode 的文件系统（macOS、Windows）后会撞车的路径：
    忽略大小写和 Unicode 写法后重复，或一个文件和某个目录同名。"""
    problems: list[str] = []
    seen: dict[str, str] = {}
    dirs: dict[str, str] = {}
    for n in paths:
        key = _path_key(n)
        if key in seen:
            problems.append(f"重复路径（忽略大小写和 Unicode 写法后）：{seen[key]} 与 {n}")
        else:
            seen[key] = n
        parts = n.rstrip("/").split("/")
        for i in range(1, len(parts)):
            dirs.setdefault(_path_key("/".join(parts[:i])), "/".join(parts[:i]))
    for key, n in seen.items():
        if key in dirs:
            problems.append(f"文件与目录重名（忽略大小写后）：{n} 与 {dirs[key]}/")
    return problems


def _head_info(root: Path) -> tuple[str | None, int | None, str | None]:
    """(HEAD 完整 sha, 提交时间戳, 带时区的提交时间)；还没有提交时全是 None。"""
    r = subprocess.run(["git", "-C", str(root), "log", "-1", "--format=%H %ct %cI"],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        return None, None, None
    sha, ts, iso = r.stdout.split()
    return sha, int(ts), iso


def _index_modes(root: Path) -> dict[str, int]:
    """被跟踪文件 → git index 里的 mode。键集合同时就是「被跟踪的文件」。"""
    out = subprocess.run(["git", "-C", str(root), "ls-files", "-s", "-z"],
                         capture_output=True, text=True, check=True).stdout
    modes = {}
    for item in out.split("\0"):
        if item:
            meta, path = item.split("\t", 1)
            modes[path] = int(meta.split()[0], 8)
    return modes


def _is_executable(root: Path, rel: str, modes: dict[str, int]) -> bool:
    """被跟踪的以 git index 为准；私有额外路径不在 index 里，看文件系统权限。"""
    if rel in modes:
        return modes[rel] == 0o100755
    return bool((root / rel).stat().st_mode & 0o111)


def _probe_paths(files: list[str]) -> list[str]:
    """升级前核对解压是否完整用：最长的若干条（Windows 最容易跳过）加两个关键文件。"""
    picked = sorted(files, key=lambda p: (-len(p), p))[:PROBE_COUNT]
    for key in ("CLAUDE.md", ".claude/skills/ai-pm/SKILL.md"):
        if key in files and key not in picked:
            picked.append(key)
    return picked


def _zip_time(ts: int | None) -> tuple:
    t = time.localtime(ts if ts is not None else time.time())
    return (max(t.tm_year, 1980), t.tm_mon, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec)


def _zip_add(zf: zipfile.ZipFile, arcname: str, data: bytes, executable: bool, date_time: tuple) -> None:
    """每个条目显式设属性：Python 的默认值是不压缩、权限 0600、时间 1980 年。"""
    info = zipfile.ZipInfo(arcname, date_time=date_time)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = (0o100755 if executable else 0o100644) << 16
    zf.writestr(info, data)


def _blocked(rel: str) -> bool:
    return any(rel.startswith(b) or rel == b.rstrip("/") for b in NEVER_INCLUDE)


def _packable(root: Path, rel: str) -> bool:
    """该路径是否真会进包：普通文件、非符号链接、工作区里存在。

    git ls-files 会把 mode 120000 的符号链接一并列出来（跨平台共享配置很常见），
    不在这里剔掉的话，.aipm-dist/versions.json 记的 file_count 会比 zip 实际条目多，
    下游按 file_count 校验就会误判。
    """
    p = root / rel
    return p.is_file() and not p.is_symlink()


def collect_files(root: Path, kind: str) -> list[str]:
    """收集要打包的文件清单。kind ∈ {public, private}。

    返回的每一项都保证进包（见 _packable），因此 len() 即 .aipm-dist/versions.json 的 file_count。
    kind 非法时抛 ValueError——静默降级成 public 会让拼错一个字母的"私有包"少打一万多个文件。
    """
    if kind not in ("public", "private"):
        raise ValueError(f"未知 kind: {kind!r}（只支持 'public' / 'private'）")
    files = _git_tracked(root)
    if kind == "private":
        for extra in PRIVATE_EXTRA:
            if extra.endswith("/"):
                files.extend(_walk_dir(root, extra))
            elif (root / extra).is_file():
                files.append(extra)
            else:
                raise SystemExit(f"⛔ 私有版额外文件 {extra} 不存在")
    deduped = sorted(set(files))
    extra = [*_mapped_files(), *PRIVATE_GENERATED] if kind == "private" else []
    clash = sorted(set(extra) & set(deduped))
    if clash:
        raise SystemExit(f"⛔ 私有版要带进包的路径与仓库文件重名：{clash[:5]}（仓库里不能跟踪这些路径）")
    # 安全线跑在过滤之前：tracked 但工作区已删的路径也照样拦截。
    blocked = [f for f in [*deduped, *extra] if _blocked(f)]
    if blocked:
        raise SystemExit(f"⛔ 安全线拦截：共 {len(blocked)} 条，前 5 条：{blocked[:5]}")
    return sorted([f for f in deduped if _packable(root, f)] + extra)


# 受管路径前缀（与 .claude/skills/ai-pm-update/references/managed-scope.md 一致）
MANAGED_PREFIX = (
    ".claude/skills/",
    ".claude/agents/",
    ".claude/hooks/",
    ".claude/settings.json",
    "CLAUDE.md",
    "templates/",
    "scripts/",
    ".gitignore",
    ".codex/hooks.json",
)
_BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".docx", ".xlsx", ".zip"}


def _is_managed(rel: str) -> bool:
    """Return whether *rel* is an explicitly managed repository path."""
    # Knowledge cards and persona content are data assets with their own merge
    # route, even if an older commit happened to track them under templates/.
    if rel.startswith(("templates/knowledge-base/", "templates/persona/")):
        return rel.endswith("/.gitkeep") or rel in (
            "templates/knowledge-base/README.md", "templates/persona/README.md")
    if rel.startswith((
        ".claude/skills/xfchat-wiki/", ".claude/skills/tpd_cli/",
        ".claude/skills/d2c/", ".claude/skills/d2c-analyze/",
        ".claude/skills/d2c-codegen/", ".claude/skills/d2c-fetch/",
        ".claude/skills/d2c-setup/",
    )):
        return False
    return rel in MANAGED_PREFIX or rel.startswith(
        tuple(prefix for prefix in MANAGED_PREFIX if prefix.endswith("/"))
    )

is_managed = _is_managed  # 校验器导入用


def collect_history(root: Path) -> dict:
    """Collect the content-addressed history of managed files.

    The index is ordered newest commit first, and each path only records a
    version when its blob changed.  Blob bytes are written by ``write_history``
    so callers can inspect the index without materialising the package.
    """
    index: dict[str, list[dict[str, str]]] = {}
    head = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "--verify", "HEAD"],
        capture_output=True, text=True,
    )
    if head.returncode != 0:
        # A newly initialised repository has no commits yet.  It can still be
        # packaged (tree/ contains staged files), but has no historical base.
        return index
    # One raw history walk is substantially faster than one ls-tree process per
    # commit (the repository has hundreds of commits).  The raw record contains
    # the new blob for each changed path, which is exactly the content history
    # the updater needs; unchanged versions are intentionally not duplicated.
    out = subprocess.run(
        [
            "git", "-C", str(root), "-c", "core.quotepath=false",
            "log", "--full-history", "--raw", "--no-renames", "--abbrev=40",
            "--format=commit %H %ad", "--date=short", "--",
            ".claude/", "CLAUDE.md", "templates/", "scripts/", ".gitignore",
            ".codex/hooks.json",
        ],
        capture_output=True, text=True, check=True,
    ).stdout
    rev = date = None
    for line in out.splitlines():
        if line.startswith("commit "):
            _, rev, date = line.split(" ", 2)
            continue
        if not line.startswith(":") or "\t" not in line or rev is None:
            continue
        meta, path_text = line.split("\t", 1)
        fields = meta.split()
        if len(fields) < 5:
            continue
        new_blob, status = fields[3], fields[4]
        if status.startswith("D") or new_blob == "0" * 40:
            continue
        # --no-renames means the path after the tab is the affected path.  A
        # literal tab in a filename is not a valid tracked path in this repo;
        # keep the final component defensive for unusual git output.
        rel = path_text.split("\t")[-1]
        # Historical files receive the same safety boundary as today's tree.
        # A once-tracked local settings file must not reappear inside history/.
        if (not _is_managed(rel) or _blocked(rel)
                or rel.endswith("settings.local.json")
                or rel == ".claude/hooks/.knowledge-capture.enabled"):
            continue
        kind = "binary" if Path(rel).suffix.lower() in _BINARY_EXT else "text"
        entries = index.setdefault(rel, [])
        short = new_blob[:12]
        if entries and entries[-1]["blob"] == short:
            continue
        entries.append({"version": rev[:7], "date": date or "", "blob": short, "kind": kind})
    return index


@lru_cache(maxsize=8192)
def _read_history_blob(root: Path, blob: str) -> bytes:
    return subprocess.run(
        ["git", "-C", str(root), "cat-file", "-p", blob],
        capture_output=True, check=True,
    ).stdout


def collect_revisions(root: Path, index: dict) -> list[dict]:
    """Build per-commit snapshots for version scoring from an allowed index.

    ``index`` may already have public-history exclusions applied.  A snapshot
    only references blobs that remain in that index, so the snapshot cannot
    resurrect a filtered historical original.
    """
    allowed = {path: {entry["blob"] for entry in entries} for path, entries in index.items()}
    if not allowed:
        return []
    candidate_versions = {entry["version"] for entries in index.values() for entry in entries}
    revs = subprocess.run(
        ["git", "-C", str(root), "rev-list", "HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    snapshots = []
    for rev in revs:
        short = rev[:7]
        if short not in candidate_versions:
            continue
        raw = subprocess.run(
            ["git", "-C", str(root), "ls-tree", "-r", "-z", "--full-tree", rev],
            capture_output=True, check=True,
        ).stdout
        files = {}
        for item in raw.split(b"\x00"):
            if not item:
                continue
            meta, _, path_bytes = item.partition(b"\t")
            parts = meta.split()
            if len(parts) < 3 or parts[1] != b"blob":
                continue
            path = path_bytes.decode("utf-8", "replace")
            blob = parts[2].decode()[:12]
            if blob in allowed.get(path, set()):
                files[path] = blob
        snapshots.append({"version": short, "files": files})
    return snapshots


def write_history(zf: zipfile.ZipFile, root: Path, index: dict, date_time: tuple) -> None:
    """把历史索引、版本快照和每个唯一 blob 写进 .aipm-dist/history/。"""
    written: set[str] = set()
    for entries in index.values():
        for entry in entries:
            blob = entry["blob"]
            if blob in written:
                continue
            data = _read_history_blob(root, blob)
            if git_blob_id(data) != blob:
                raise ValueError(f"历史 blob 校验失败：{blob}")
            _zip_add(zf, f"{DIST}/history/{blob}.blob", data, False, date_time)
            written.add(blob)
    _zip_add(zf, f"{DIST}/history/index.json",
             json.dumps(index, ensure_ascii=False, indent=2).encode("utf-8"), False, date_time)
    revisions = json.dumps(
        {"schema_version": 1, "revisions": collect_revisions(root, index)},
        ensure_ascii=False, separators=(",", ":"),
    ).encode("utf-8")
    _zip_add(zf, f"{DIST}/history/revisions.json", revisions, False, date_time)


@lru_cache(maxsize=8192)
def _history_blob_is_public(root: Path, blob: str, rules: tuple[str, ...]) -> bool:
    data = _read_history_blob(root, blob)
    # Scan binary bytes too: UTF-8 fragments (metadata, embedded labels) can
    # still contain internal names even when the asset cannot be line-merged.
    text = data.decode("utf-8", "ignore")
    return not any(re.search(rule, text, re.IGNORECASE) for rule in rules)


def _public_history(root: Path, index: dict) -> dict:
    """Exclude historical blobs with internal names from the public package.

    Current tracked files are covered by check-share-readiness.sh, but old Git
    blobs are otherwise invisible to that check.  The author's private denylist
    is therefore required when a public package contains history.
    """
    if not index:
        return index
    denylist = root / "scripts" / ".share-denylist"
    if not denylist.is_file():
        raise SystemExit("⛔ 公共包 history 校验需要 scripts/.share-denylist；先配置分享清单")
    rules = []
    for line in denylist.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.lstrip().startswith("#"):
            rules.append(line)
    if not rules:
        raise SystemExit("⛔ 公共包 history 校验需要非空 scripts/.share-denylist")
    patterns = [re.compile(rule, re.IGNORECASE) for rule in rules]
    rule_key = tuple(rules)

    result: dict[str, list[dict]] = {}
    for rel, entries in index.items():
        if any(pattern.search(rel) for pattern in patterns):
            continue
        kept = []
        for entry in entries:
            blob = entry["blob"]
            if _history_blob_is_public(root, blob, rule_key):
                kept.append(entry)
        if kept:
            result[rel] = kept
    return result


def _dirty_tracked(root: Path) -> list[str]:
    """被跟踪且有未提交改动的文件（未跟踪文件不算）。"""
    out = subprocess.run(
        ["git", "-C", str(root), "-c", "core.quotepath=off", "status", "--porcelain=v1",
         "--untracked-files=no"],
        capture_output=True, text=True, check=True,
    ).stdout
    return sorted(line[3:] for line in out.splitlines() if line.strip())


def build_package(root: Path, kind: str, out: Path, version: str, *,
                  force: bool = False, allow_dirty: bool = False) -> Path:
    """打包并返回 <out>/AI_PM.zip。先算完历史再建目录：中途失败不留半成品。
    `allow_dirty` 只给测试用：开发途中拿当前仓库打包。命令行不提供这个开关。"""
    if out.suffix.lower() == ".zip":
        raise SystemExit(f"⛔ --out 要给文件夹，不是 zip 路径：{out}（产物固定叫 {PACKAGE_NAME}）")
    if not version_ok(version):
        raise SystemExit(f"⛔ 版本号 {version!r} 不合规：只能用字母、数字和 . _ + -，以字母或数字开头，最长 64 位")
    target = out / PACKAGE_NAME
    if target.exists() and not force:
        raise SystemExit(f"⛔ {target} 已存在；确认要覆盖就加 --force")
    files = collect_files(root, kind)
    if IGNORE_FILE in files:
        raise SystemExit(f"⛔ 仓库根的 {IGNORE_FILE} 由打包器生成，不能被 git 跟踪")
    if not allow_dirty and _head_info(root)[0] is not None:  # 没有提交的仓库在下面单独拒绝
        dirty = _dirty_tracked(root)
        if dirty:
            raise SystemExit(f"⛔ 有 {len(dirty)} 个被跟踪文件改了没提交，打出来的包对不上任何提交。"
                             f"先提交或还原：{dirty[:10]}")
    bad_paths = [p for f in files for p in path_problems(f)]
    if bad_paths:
        raise SystemExit(f"⛔ 有 {len(bad_paths)} 个路径在 Windows 上解压不了或越界，先改名：{bad_paths[:10]}")
    clashes = duplicate_problems(files)
    if clashes:
        raise SystemExit(f"⛔ 有 {len(clashes)} 处路径在 macOS / Windows 上解压会互相覆盖，先改名：{clashes[:10]}")
    commit, commit_ts, commit_iso = _head_info(root)
    if commit is None:  # 包要记下对应哪个提交，校验器和升级都靠它（2026-10-13，验收 R-02）
        raise SystemExit(f"⛔ {root} 还没有提交，打出来的包对不上任何提交。先提交一次再打包")
    history = collect_history(root)
    if kind == "public":
        history = _public_history(root, history)
    modes = _index_modes(root)
    date_time = _zip_time(commit_ts)
    changelog = ((root / "CHANGELOG.md").read_text(encoding="utf-8")
                 if (root / "CHANGELOG.md").is_file() else "# changelog\n\n（尚无记录）\n")
    mapped = _mapped_files() if kind == "private" else {}
    out.mkdir(parents=True, exist_ok=True)
    part = target.with_name(target.name + ".part")
    manifest: dict[str, dict] = {}
    blobs: dict[str, str] = {}
    try:
        with zipfile.ZipFile(part, "w") as zf:
            for rel in files:  # collect_files 已排序、已保证每项都能进包
                if kind == "private" and rel in PRIVATE_GENERATED:
                    data, exe = PRIVATE_GENERATED[rel].encode("utf-8"), False
                elif rel in mapped:
                    data, exe = mapped[rel].read_bytes(), bool(mapped[rel].stat().st_mode & 0o111)
                else:
                    data, exe = (root / rel).read_bytes(), _is_executable(root, rel, modes)
                _zip_add(zf, rel, data, exe, date_time)
                blobs[rel] = git_blob_id(data)
                if _is_managed(rel) and rel in modes:  # 只收被跟踪的受管文件：本机私有文件不受管
                    manifest[rel] = {"blob": blobs[rel], "exec": exe}
            _zip_add(zf, IGNORE_FILE, IGNORE_CONTENT.encode("utf-8"), False, date_time)
            versions_meta = {
                "schema": VERSIONS_SCHEMA,
                "version": version,
                "kind": kind,
                "commit": commit,
                "commit_time": commit_iso,
                "content_digest": content_digest(blobs),
                "probe_paths": _probe_paths(files),
                "built_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "file_count": len(files),
            }
            for name, text in (
                (f"{DIST}/versions.json", json.dumps(versions_meta, ensure_ascii=False, indent=2)),
                (f"{DIST}/manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1, sort_keys=True)),
                (f"{DIST}/changelog.md", changelog),
                (f"{DIST}/README.md", DIST_README),
            ):
                _zip_add(zf, name, text.encode("utf-8"), False, date_time)
            write_history(zf, root, history, date_time)
        part.replace(target)
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    return target


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["public", "private"], required=True)
    ap.add_argument("--out", default=None, help="输出文件夹，默认 <仓库>/dist/<kind>/；产物固定叫 AI_PM.zip")
    ap.add_argument("--version", default=time.strftime("%Y%m%d"))
    ap.add_argument("--force", action="store_true", help="覆盖已存在的 AI_PM.zip")
    ap.add_argument("--root", default=str(ROOT))
    args = ap.parse_args()
    root = Path(args.root)
    out = Path(args.out).expanduser() if args.out else root / "dist" / args.kind
    path = build_package(root, args.kind, out, args.version, force=args.force)
    print(f"✅ {path}  ({path.stat().st_size / 1024 / 1024:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
