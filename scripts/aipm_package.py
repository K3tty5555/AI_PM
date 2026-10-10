#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI_PM 打包器（作者侧工具）。

按 git ls-files 收集文件——绝不用排除法。
实测教训：「去掉 output 后的目录」是 926 MB，其中 .ai-shared/conversations/raw/*.jsonl
单文件 104 MB、前十合计 380 MB，那是作者的真实对话记录。用排除法打包会直接发出去。

用法：
    python3 scripts/aipm_package.py --kind public  --out dist/
    python3 scripts/aipm_package.py --kind private --out dist/
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import io
import json
import hashlib
import re
import subprocess
import sys
import tarfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

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

# 任何版本都不得携带的路径（安全线）
NEVER_INCLUDE = [
    "output/projects/",
    "output/_archive/",
    "output/backups/",
    "output/sharing/",
    "output/weekly/",
    ".claude/projects/",
    ".claude/settings.local.json",
    ".d2c/",
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

    目录不存在时打到 stderr 而不是静默返回空——PRIVATE_EXTRA 拼错一个字母
    就等于静默少打一整块资源，方向正是"少了还以为 OK"。
    """
    base = root / rel
    if not base.exists():
        print(f"⚠️  {rel} 不存在，已跳过（PRIVATE_EXTRA 是否拼错？）", file=sys.stderr)
        return []
    if not base.is_dir():
        print(f"⚠️  {rel} 不是目录，已跳过", file=sys.stderr)
        return []
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


def _blocked(rel: str) -> bool:
    return any(rel.startswith(b) or rel == b.rstrip("/") for b in NEVER_INCLUDE)


def _packable(root: Path, rel: str) -> bool:
    """该路径是否真会进包：普通文件、非符号链接、工作区里存在。

    git ls-files 会把 mode 120000 的符号链接一并列出来（跨平台共享配置很常见），
    不在这里剔掉的话，meta/versions.json 记的 file_count 会比 tar 实际条目多，
    下游按 file_count 校验就会误判。
    """
    p = root / rel
    return p.is_file() and not p.is_symlink()


def collect_files(root: Path, kind: str) -> list[str]:
    """收集要打包的文件清单。kind ∈ {public, private}。

    返回的每一项都保证进包（见 _packable），因此 len() 即 meta/versions.json 的 file_count。
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
    deduped = sorted(set(files))
    # 安全线跑在过滤之前：tracked 但工作区已删的路径也照样拦截。
    blocked = [f for f in deduped if _blocked(f)]
    if blocked:
        raise SystemExit(f"⛔ 安全线拦截：共 {len(blocked)} 条，前 5 条：{blocked[:5]}")
    return [f for f in deduped if _packable(root, f)]


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


def write_history(tf, root: Path, index: dict) -> None:
    """Write the history index and each unique blob into an open tar file."""
    written: set[str] = set()
    for entries in index.values():
        for entry in entries:
            blob = entry["blob"]
            if blob in written:
                continue
            data = _read_history_blob(root, blob)
            actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\x00" + data).hexdigest()
            if not actual.startswith(blob):
                raise ValueError(f"历史 blob 校验失败：{blob}")
            info = tarfile.TarInfo(f"history/{blob}")
            info.size = len(data)
            info.mtime = int(time.time())
            tf.addfile(info, io.BytesIO(data))
            written.add(blob)
    payload = json.dumps(index, ensure_ascii=False, indent=2).encode("utf-8")
    info = tarfile.TarInfo("history/index.json")
    info.size = len(payload)
    info.mtime = int(time.time())
    tf.addfile(info, io.BytesIO(payload))
    revisions = json.dumps(
        {"schema_version": 1, "revisions": collect_revisions(root, index)},
        ensure_ascii=False, separators=(",", ":"),
    ).encode("utf-8")
    info = tarfile.TarInfo("history/revisions.json")
    info.size = len(revisions)
    info.mtime = int(time.time())
    tf.addfile(info, io.BytesIO(revisions))


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


def build_package(root: Path, kind: str, out: Path, version: str) -> Path:
    """打包并返回产物路径。"""
    files = collect_files(root, kind)
    history = collect_history(root)
    if kind == "public":
        history = _public_history(root, history)
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"AI_PM-{kind}-{version}.tar.gz"

    versions_meta = {
        "version": version,
        "kind": kind,
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "file_count": len(files),
    }
    changelog = (root / "CHANGELOG.md").read_text(encoding="utf-8") if (root / "CHANGELOG.md").is_file() else "# changelog\n\n（尚无记录）\n"

    with tarfile.open(target, "w:gz") as tf:
        for rel in files:
            # collect_files 已保证每一项都能进包，这里不再静默跳过——
            # 否则 file_count 与实际条目又会分叉（见 _packable）。
            tf.add(root / rel, arcname=f"tree/{rel}")
        for name, content in (("meta/versions.json", json.dumps(versions_meta, ensure_ascii=False, indent=2)),
                              ("meta/changelog.md", changelog)):
            data = content.encode("utf-8")
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mtime = int(time.time())
            tf.addfile(info, io.BytesIO(data))
        write_history(tf, root, history)
    return target


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["public", "private"], required=True)
    ap.add_argument("--out", default="dist")
    ap.add_argument("--version", default=time.strftime("%Y%m%d"))
    ap.add_argument("--root", default=str(ROOT))
    args = ap.parse_args()
    path = build_package(Path(args.root), args.kind, Path(args.out), args.version)
    print(f"✅ {path}  ({path.stat().st_size / 1024 / 1024:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
