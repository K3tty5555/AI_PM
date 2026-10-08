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
    """收集目录下所有普通文件（跳过符号链接）。"""
    base = root / rel
    if not base.exists():
        return []
    found = []
    for p in base.rglob("*"):
        if p.is_symlink() or not p.is_file():
            continue
        found.append(p.relative_to(root).as_posix())
    return found


def _blocked(rel: str) -> bool:
    return any(rel.startswith(b) or rel == b.rstrip("/") for b in NEVER_INCLUDE)


def collect_files(root: Path, kind: str) -> list[str]:
    """收集要打包的文件清单。kind ∈ {public, private}。"""
    files = _git_tracked(root)
    if kind == "private":
        for extra in PRIVATE_EXTRA:
            if extra.endswith("/"):
                files.extend(_walk_dir(root, extra))
            elif (root / extra).is_file():
                files.append(extra)
    deduped = sorted(set(files))
    blocked = [f for f in deduped if _blocked(f)]
    if blocked:
        raise SystemExit(f"⛔ 安全线拦截：以下文件不得进任何包：{blocked[:5]}")
    return deduped


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
            src = root / rel
            if not src.is_file() or src.is_symlink():
                continue
            tf.add(src, arcname=f"tree/{rel}")
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
