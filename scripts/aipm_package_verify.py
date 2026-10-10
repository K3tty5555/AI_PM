#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI_PM 分发包校验器。只读。

设计原则：**按路径判，不按裸词判**。裸词判据会把合法资产一起打死，
而一个爱误杀的校验器等于没有校验器——报错多了人就开始无视报错。
每一条判据都拿 Task 4 的真实产物实测过（见 test_aipm_package.TestVerify）。

用法：
    python3 scripts/aipm_package_verify.py <包路径> --kind public|private
退出码：0=通过，1=有问题（噪声项只提示，不影响退出码）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import tarfile
from pathlib import Path

# 任何包都不得包含的路径片段。
# 注意每条都是「带上下文的路径」而非裸词：
#   - `.d2c/config.json` 只拦 MasterGo PAT 那一份；tsconfig.json / style-config.json 是合法资产
#   - `tree/docs/` 只拦仓库根 docs/；蒸馏包里的 content-full/docs/ 是内容不是私有目录
#   - `.ai-shared/conversations` 而不是 `conversations`：ai-sync 的 snapshot-*-conversations.sh
#     是产出对话归档的工具脚本，本来就该随仓库分发
FORBIDDEN = [
    ".ai-shared/conversations",
    ".ai-shared/memory-snapshots",
    ".claude/projects",
    ".claude/settings.local.json",
    "settings.local.json",
    ".d2c/config.json",
    "output/projects/",
    "tree/docs/",
    "/.git/",  # 嵌套 git 仓库（内部提交历史）绝不能混进任何分发包（2026-10-10）
]

# 噪声项：vendor / 私有 skill 内真实存在的系统文件，提示但不计入退出码
WARN_ONLY = [".DS_Store"]

REQUIRED = ["meta/versions.json", "meta/changelog.md", "history/index.json",
            "history/revisions.json"]

# 体积上界（MB）
MAX_MB = {"public": 60, "private": 400}
# 未知 kind 时的兜底上界（走私有档，避免因调用方传错 kind 而误报）。
# 单独写成常量是因为 `MAX_MB.get(kind, MAX_MB["private"])` 的默认值是急切求值的，
# 把 MAX_MB 整个换掉（测试里常这么干）会直接 KeyError。
MAX_MB_DEFAULT = 400


def collect_warnings(tar_path: Path) -> list[str]:
    """噪声项提示。单独一个函数，方便 CLI 打印而 verify() 保持纯问题清单。"""
    warnings: list[str] = []
    with tarfile.open(tar_path) as tf:
        for n in tf.getnames():
            for w in WARN_ONLY:
                if w in n:
                    warnings.append(f"噪声文件（不阻断）：{n}")
    return warnings


def verify(tar_path: Path, kind: str) -> list[str]:
    """校验一个包，返回问题清单。空列表 = 通过。

    只读：不解包、不写盘。tar 损坏时抛 tarfile.TarError（调用方决定怎么呈现）。
    """
    problems: list[str] = []
    with tarfile.open(tar_path) as tf:
        names = tf.getnames()

        for n in names:
            for f in FORBIDDEN:
                if f in n:
                    problems.append(f"禁止路径混入：{n}")

        for r in REQUIRED:
            if r not in names:
                problems.append(f"缺少必需文件：{r}")

        if not any(n.startswith("tree/") for n in names):
            problems.append("缺少 tree/ 内容")

        index = {}
        if "history/index.json" in names:
            try:
                index = json.loads(tf.extractfile("history/index.json").read().decode("utf-8"))
                if not isinstance(index, dict):
                    raise ValueError("索引不是对象")
                blob_names = {n.removeprefix("history/") for n in names if n.startswith("history/")}
                for path, entries in index.items():
                    if not isinstance(path, str) or not isinstance(entries, list):
                        raise ValueError(f"索引条目格式错误：{path!r}")
                    for entry in entries:
                        blob = entry["blob"]
                        if not isinstance(blob, str) or not re.fullmatch(r"[0-9a-f]{12}", blob):
                            raise ValueError(f"非法 blob 标识：{blob!r}")
                        if blob not in blob_names:
                            problems.append(f"history 索引指向缺失 blob：{path} → {blob}")
            except (AttributeError, KeyError, TypeError, ValueError, UnicodeDecodeError) as exc:
                problems.append(f"history/index.json 格式错误：{exc}")

        if "history/revisions.json" in names and "history/index.json" in names:
            try:
                revisions = json.loads(tf.extractfile("history/revisions.json").read().decode("utf-8"))
                if revisions.get("schema_version") != 1 or not isinstance(revisions.get("revisions"), list):
                    raise ValueError("缺少 schema_version=1 或 revisions 列表")
                allowed_by_path = {
                    path: {entry["blob"] for entry in entries}
                    for path, entries in index.items()
                }
                for revision in revisions["revisions"]:
                    if not isinstance(revision.get("version"), str) or not isinstance(revision.get("files"), dict):
                        raise ValueError("版本快照结构错误")
                    for path, blob in revision["files"].items():
                        if blob not in allowed_by_path.get(path, set()):
                            problems.append(f"版本快照引用未收录原件：{revision['version']} {path} → {blob}")
            except (AttributeError, KeyError, TypeError, ValueError, UnicodeDecodeError) as exc:
                problems.append(f"history/revisions.json 格式错误：{exc}")

        # 包自报的 kind 与校验声明必须一致：私有包被当公共包发出去，
        # 是这套工具里后果最重的一种错，值得一条独立判据。
        meta_name = "meta/versions.json" if "meta/versions.json" in names else None
        if meta_name is not None:
            try:
                meta = json.loads(tf.extractfile(meta_name).read().decode("utf-8"))
            except (AttributeError, ValueError, UnicodeDecodeError):
                problems.append(f"meta/versions.json 读不出合法 JSON：{meta_name}")
            else:
                if meta.get("kind") not in (None, kind):
                    problems.append(
                        f"kind 不符：包内 meta 声明 {meta.get('kind')!r}，校验按 {kind!r}")

    size_mb = tar_path.stat().st_size / 1024 / 1024
    limit = MAX_MB.get(kind, MAX_MB_DEFAULT)
    if size_mb > limit:
        problems.append(f"体积超上界：{size_mb:.1f} MB > {limit} MB（kind={kind}）")

    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="AI_PM 分发包校验器（只读）")
    ap.add_argument("package")
    ap.add_argument("--kind", choices=["public", "private"], required=True)
    args = ap.parse_args(argv)

    tar_path = Path(args.package)
    problems = verify(tar_path, args.kind)
    warnings = collect_warnings(tar_path)
    for w in warnings:
        print(f"💡 {w}")

    if problems:
        print(f"⛔ 校验未过（{len(problems)} 项）：")
        for p in problems:
            print(f"   - {p}")
        return 1

    suffix = f"（{len(warnings)} 条噪声提示，不影响结论）" if warnings else ""
    print(f"✅ 包校验通过{suffix}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
