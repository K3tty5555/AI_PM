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
]

# 噪声项：vendor / 私有 skill 内真实存在的系统文件，提示但不计入退出码
WARN_ONLY = [".DS_Store"]

REQUIRED = ["meta/versions.json", "meta/changelog.md"]

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
            if not any(n.endswith(r) for n in names):
                problems.append(f"缺少必需文件：{r}")

        if not any(n.startswith("tree/") for n in names):
            problems.append("缺少 tree/ 内容")

        # 包自报的 kind 与校验声明必须一致：私有包被当公共包发出去，
        # 是这套工具里后果最重的一种错，值得一条独立判据。
        meta_name = next((n for n in names if n.endswith("meta/versions.json")), None)
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
