#!/usr/bin/env python3
"""校验 output 顶层目录与项目规范都指向同一注册表。"""

from __future__ import annotations

import argparse
import re
import tempfile
from pathlib import Path
from typing import List, Set


REGISTRY_RELATIVE = Path(
    ".claude/skills/ai-pm/references/output-containers.md"
)
POINTER = REGISTRY_RELATIVE.as_posix()
POLICY_FILES = (
    Path("CLAUDE.md"),
    Path(".claude/skills/ai-pm/doctor.md"),
    Path("templates/project-index/README.md"),
)
START_MARKER = "<!-- output-container-registry:start -->"
END_MARKER = "<!-- output-container-registry:end -->"
CONTAINER_RE = re.compile(r"`([A-Za-z0-9_.-]+/)`")
OLD_POLICY_PATTERNS = (
    re.compile(r"output/.*顶层只允许"),
    re.compile(r"不在这两处以外新建子目录"),
    re.compile(r"顶层(?:目录)?只允许.*projects/.*assets/"),
)


def parse_registry(path: Path) -> Set[str]:
    """读取注册区内反引号包裹、以 / 结尾的顶层容器名。"""
    text = path.read_text(encoding="utf-8")
    if START_MARKER not in text or END_MARKER not in text:
        raise ValueError("注册表缺少机器可读的 start/end 标记")
    registry_text = text.split(START_MARKER, 1)[1].split(END_MARKER, 1)[0]
    return set(CONTAINER_RE.findall(registry_text))


def validate_registry(repo_root: Path) -> List[str]:
    """返回未登记目录、缺少单源指针和旧完整白名单残留。"""
    repo_root = repo_root.resolve()
    registry_path = repo_root / REGISTRY_RELATIVE
    problems: List[str] = []

    if not registry_path.is_file():
        return [f"缺少 output 容器注册表：{POINTER}"]
    try:
        registered = parse_registry(registry_path)
    except (OSError, UnicodeError, ValueError) as exc:
        return [f"output 容器注册表无法解析：{exc}"]

    if "sharing/" not in registered:
        problems.append("output 容器注册表必须登记 sharing/")

    output_root = repo_root / "output"
    if output_root.is_dir():
        actual = {
            f"{path.name}/"
            for path in output_root.iterdir()
            if path.is_dir() or path.is_symlink()
        }
        for container in sorted(actual - registered):
            problems.append(f"output 顶层目录未登记：{container}")

    for relative_path in POLICY_FILES:
        policy_path = repo_root / relative_path
        try:
            text = policy_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            problems.append(f"缺少策略文件：{relative_path.as_posix()}")
            continue
        except (OSError, UnicodeError) as exc:
            problems.append(
                f"策略文件无法读取：{relative_path.as_posix()}（{exc}）"
            )
            continue
        if POINTER not in text:
            problems.append(
                f"策略文件未引用 output 注册表：{relative_path.as_posix()}"
            )
        for pattern in OLD_POLICY_PATTERNS:
            if pattern.search(text):
                problems.append(
                    f"策略文件残留旧顶层白名单："
                    f"{relative_path.as_posix()}（{pattern.pattern}）"
                )
    return problems


def _write_selftest_policy(repo: Path, registry_text: str) -> None:
    registry = repo / REGISTRY_RELATIVE
    registry.parent.mkdir(parents=True, exist_ok=True)
    registry.write_text(registry_text, encoding="utf-8")
    for relative_path in POLICY_FILES:
        path = repo / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"引用 `{POINTER}`。\n", encoding="utf-8")


def run_selftest() -> int:
    registry_text = (
        f"{START_MARKER}\n"
        "| 类型 | 容器 |\n"
        "|---|---|\n"
        "| 核心 | `projects/`、`sharing/` |\n"
        f"{END_MARKER}\n"
    )
    with tempfile.TemporaryDirectory() as tempdir:
        repo = Path(tempdir)
        _write_selftest_policy(repo, registry_text)
        (repo / "output" / "projects").mkdir(parents=True)
        if validate_registry(repo):
            print("SELFTEST FAIL：已登记目录应通过")
            return 1
        (repo / "output" / "surprise").mkdir()
        problems = validate_registry(repo)
        if not any("surprise/" in problem for problem in problems):
            print("SELFTEST FAIL：未登记目录应失败")
            return 1

    with tempfile.TemporaryDirectory() as tempdir:
        repo = Path(tempdir)
        _write_selftest_policy(repo, registry_text)
        if validate_registry(repo):
            print("SELFTEST FAIL：无 output 的 fresh clone 应通过")
            return 1

    print("SELFTEST OK：output 容器注册校验器")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="校验 output 顶层容器注册")
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="仓库根目录；默认从脚本位置推导",
    )
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="运行内置临时目录测试",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.selftest:
        return run_selftest()
    problems = validate_registry(args.repo_root)
    if problems:
        for problem in problems:
            print(f"❌ {problem}")
        return 1
    print("✅ output 顶层容器均已登记，策略文件指向单一注册表")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
