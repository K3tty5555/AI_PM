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
import io
import json
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
        found.append(p.relative_to(root).as_posix())
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


def build_package(root: Path, kind: str, out: Path, version: str) -> Path:
    """打包并返回产物路径。"""
    files = collect_files(root, kind)
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
