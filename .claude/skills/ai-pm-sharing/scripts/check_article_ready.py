#!/usr/bin/env python3
"""检查经验分享候选稿，并在全部门禁通过后原子发布。"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from typing import List, Optional, Pattern, Tuple
from urllib.parse import unquote


INLINE_LINK_RE = re.compile(r"!?\[[^\]\n]*\]\(([^)\n]+)\)")
REFERENCE_DEF_RE = re.compile(
    r"(?m)^\s*\[[^\]\n]+\]:\s*(\S+)",
)
REFERENCE_USE_RE = re.compile(r"!?\[[^\]\n]+\]\[[^\]\n]*\]")
HTML_LOCAL_IMAGE_RE = re.compile(
    r"""<img\b[^>]*\bsrc\s*=\s*["'](?!https?://|data:)[^"']+["'][^>]*>""",
    re.IGNORECASE,
)
PRD_HEADING_RE = re.compile(
    r"(?mi)^#{1,6}\s*(?:[一二三四五六七八九十0-9]+[、.．]\s*)?"
    r"(?:产品需求文档|功能清单|功能需求|验收标准|非功能需求)\s*$"
)
SECRET_RE = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b"
    r"|(?i:(?:password|passwd|api[_-]?key|secret)\s*[:=]\s*\S{8,})"
)
TEMPLATE_TITLE = "# 用具体问题、关键判断或实践结果命名"
RISKY_METADATA_KEY_RE = re.compile(
    r"(?:gps|location|address|author|artist|creator|owner|copyright|"
    r"comment|description|keyword|subject|title|company|serial|"
    r"hostcomputer|documentname|person)",
    re.IGNORECASE,
)


def load_deny_patterns(
    path: Optional[Path],
    strict: bool,
    confirm_missing: bool,
) -> Tuple[List[Pattern[str]], List[str]]:
    """按一行一个正则加载 denylist；错误以阻断问题返回。"""
    if path is None or not path.is_file():
        if strict and not confirm_missing:
            return [], ["严格模式缺少 denylist，必须配置或显式确认缺失"]
        return [], []

    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        return [], [f"denylist 无法读取：{exc}"]

    raw_patterns = [
        line.strip()
        for line in lines
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not raw_patterns:
        if strict and not confirm_missing:
            return [], ["严格模式 denylist 为空，必须配置或显式确认缺失"]
        return [], []

    patterns: List[Pattern[str]] = []
    problems: List[str] = []
    for line_number, raw_pattern in enumerate(raw_patterns, start=1):
        try:
            patterns.append(re.compile(raw_pattern))
        except re.error as exc:
            problems.append(
                f"denylist 正则无效（有效规则第 {line_number} 行）：{exc}"
            )
    return patterns, problems


def _relative_lexical(path: Path, parent: Path) -> Optional[Path]:
    try:
        return path.absolute().relative_to(parent.absolute())
    except ValueError:
        return None


def _path_boundary_problems(
    workspace: Path,
    articles_root: Path,
) -> List[str]:
    problems: List[str] = []
    root_absolute = articles_root.absolute()
    workspace_absolute = workspace.absolute()

    if _relative_lexical(workspace_absolute, root_absolute) is None:
        return ["工作区不在指定 articles_root 内"]

    try:
        repo_guess = root_absolute.parents[2]
    except IndexError:
        repo_guess = root_absolute.parent

    scoped_paths = [
        repo_guess,
        repo_guess / "output",
        repo_guess / "output" / "sharing",
        root_absolute,
        workspace_absolute,
        workspace_absolute / "_private",
        workspace_absolute / "_private" / "candidate.md",
        workspace_absolute / "_private" / "assets",
        workspace_absolute / "_meta.json",
        workspace_absolute / "publish",
    ]
    for path in scoped_paths:
        if path.is_symlink():
            problems.append(f"路径不能是符号链接：{path}")

    try:
        root_resolved = root_absolute.resolve()
        workspace_resolved = workspace_absolute.resolve()
        repo_resolved = repo_guess.resolve()
        if not root_resolved.is_relative_to(repo_resolved):
            problems.append("articles_root 解析后超出仓库根目录")
        if not workspace_resolved.is_relative_to(root_resolved):
            problems.append("工作区解析后超出 articles_root")
    except OSError as exc:
        problems.append(f"路径无法解析：{exc}")

    for tree in (
        workspace_absolute / "_private" / "assets",
        workspace_absolute / "publish",
    ):
        if tree.exists() and tree.is_dir() and not tree.is_symlink():
            for item in tree.rglob("*"):
                if item.is_symlink():
                    problems.append(f"目录内存在符号链接：{item}")
    return problems


def _load_metadata(workspace: Path) -> Tuple[dict, List[str]]:
    metadata_path = workspace / "_meta.json"
    if metadata_path.is_symlink():
        return {}, ["_meta.json 不能是符号链接"]
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}, ["缺少 _meta.json"]
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return {}, [f"_meta.json 损坏或无法读取：{exc}"]
    if not isinstance(metadata, dict):
        return {}, ["_meta.json 顶层必须是对象"]

    problems: List[str] = []
    if metadata.get("content_type") != "article":
        problems.append("_meta.json 的 content_type 必须为 article")
    if metadata.get("status") != "draft":
        problems.append("_meta.json 的 status 必须为 draft")
    return metadata, problems


def _text_problems(text: str) -> List[str]:
    problems: List[str] = []
    residue_checks = (
        (re.compile(r"\{\{[^{}\n]+\}\}"), "{{...}} 占位符"),
        (re.compile(r"\[(?:待补|待核实)\]"), "待补/待核实标记"),
        (re.compile(r"\b(?:TODO|TBD)\b", re.IGNORECASE), "TODO/TBD 标记"),
        (re.compile(r"<!--[\s\S]*?-->"), "HTML 注释"),
    )
    for pattern, label in residue_checks:
        if pattern.search(text):
            problems.append(f"模板残留：{label}")
    if TEMPLATE_TITLE in text:
        problems.append("模板残留：示例标题尚未替换")
    if PRD_HEADING_RE.search(text):
        problems.append("检测到 PRD 骨架标题")
    if SECRET_RE.search(text):
        problems.append("检测到疑似密钥或口令")
    return problems


def _denylist_problems(
    text: str,
    path_names: List[str],
    patterns: List[Pattern[str]],
) -> List[str]:
    problems: List[str] = []
    for pattern in patterns:
        if pattern.search(text):
            problems.append(f"正文命中 denylist 正则：{pattern.pattern}")
        matched_paths = [name for name in path_names if pattern.search(name)]
        for name in matched_paths:
            problems.append(
                f"附件路径命中 denylist 正则：{pattern.pattern}（{name}）"
            )
    return problems


def _is_external_target(target: str) -> bool:
    lower = target.lower()
    return (
        lower.startswith("http://")
        or lower.startswith("https://")
        or lower.startswith("mailto:")
        or lower.startswith("#")
    )


def _collect_asset_targets(
    text: str,
    assets_root: Path,
) -> Tuple[List[Path], List[str]]:
    """解析首版支持的内联本地附件，并验证它们留在 assets 下。"""
    targets: List[Path] = []
    problems: List[str] = []

    if HTML_LOCAL_IMAGE_RE.search(text):
        problems.append("不支持的本地附件语法：HTML 图片")

    local_definitions = [
        match.group(1)
        for match in REFERENCE_DEF_RE.finditer(text)
        if not _is_external_target(match.group(1))
    ]
    if local_definitions or (
        REFERENCE_USE_RE.search(text) and REFERENCE_DEF_RE.search(text)
    ):
        problems.append("不支持的本地附件语法：引用式链接")

    for match in INLINE_LINK_RE.finditer(text):
        raw_target = match.group(1).strip()
        if _is_external_target(raw_target):
            continue
        if raw_target.startswith("<") or any(
            char.isspace() for char in raw_target
        ):
            problems.append(
                f"不支持的本地附件语法：{raw_target or '空目标'}"
            )
            continue
        if "?" in raw_target:
            problems.append(f"本地附件不能带 query string：{raw_target}")
            continue

        path_part = raw_target.split("#", 1)[0]
        decoded = unquote(path_part)
        pure_path = PurePosixPath(decoded)
        if (
            not decoded.startswith("assets/")
            or decoded.startswith("/")
            or "\\" in decoded
            or ".." in pure_path.parts
            or "." in pure_path.parts
        ):
            problems.append(f"附件路径逃逸或不在 assets/：{raw_target}")
            continue

        relative_asset = Path(*pure_path.parts[1:])
        if not relative_asset.parts:
            problems.append(f"附件路径无文件名：{raw_target}")
            continue
        asset_path = assets_root / relative_asset
        try:
            resolved_asset = asset_path.resolve()
            resolved_root = assets_root.resolve()
            if not resolved_asset.is_relative_to(resolved_root):
                problems.append(f"附件路径逃逸：{raw_target}")
                continue
        except OSError as exc:
            problems.append(f"附件路径无法解析：{raw_target}（{exc}）")
            continue
        if asset_path.is_symlink():
            problems.append(f"附件不能是符号链接：{raw_target}")
            continue
        if not asset_path.is_file():
            problems.append(f"附件不存在：{raw_target}")
            continue
        if asset_path not in targets:
            targets.append(asset_path)
    return targets, problems


def _asset_files(assets_root: Path) -> List[Path]:
    if not assets_root.is_dir() or assets_root.is_symlink():
        return []
    return [
        path
        for path in assets_root.rglob("*")
        if path.is_file() and not path.is_symlink()
    ]


def _inspect_metadata(
    files: List[Path],
    exiftool: str,
) -> List[str]:
    if not files:
        return []
    try:
        result = subprocess.run(
            [exiftool, "-json", "-n"] + [str(path) for path in files],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as exc:
        return [f"exiftool 元数据检查失败：{exc}"]
    if result.returncode != 0:
        detail = result.stderr.strip() or f"退出码 {result.returncode}"
        return [f"exiftool 元数据检查失败：{detail}"]
    try:
        records = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as exc:
        return [f"exiftool 返回无法解析：{exc}"]

    risky_keys = set()
    for record in records if isinstance(records, list) else []:
        if not isinstance(record, dict):
            continue
        for key, value in record.items():
            if key == "SourceFile" or value in (None, "", [], {}):
                continue
            if RISKY_METADATA_KEY_RE.search(key):
                risky_keys.add(key)
    if risky_keys:
        return [
            "附件元数据尚未清除，发现字段："
            + "、".join(sorted(risky_keys))
        ]
    return []


def validate_candidate(
    workspace: Path,
    articles_root: Path,
    denylist: Optional[Path],
    strict: bool = True,
    confirm_missing_denylist: bool = False,
    confirm_visual_review: bool = False,
    confirm_metadata_review: bool = False,
) -> List[str]:
    """只读检查候选稿，返回全部阻断问题。"""
    workspace = Path(workspace)
    articles_root = Path(articles_root)
    problems = _path_boundary_problems(workspace, articles_root)
    if any(
        "工作区不在" in problem
        or "解析后超出" in problem
        or "工作区解析" in problem
        for problem in problems
    ):
        return problems

    _, metadata_problems = _load_metadata(workspace)
    problems.extend(metadata_problems)

    candidate = workspace / "_private" / "candidate.md"
    text = ""
    if candidate.is_symlink():
        problems.append("候选稿不能是符号链接")
    elif not candidate.exists():
        problems.append("缺少候选稿 _private/candidate.md")
    elif not candidate.is_file():
        problems.append("候选稿必须是普通文件")
    else:
        try:
            text = candidate.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            problems.append(f"候选稿无法读取：{exc}")
        if not text.strip():
            problems.append("候选稿为空")

    patterns, denylist_problems = load_deny_patterns(
        denylist,
        strict,
        confirm_missing_denylist,
    )
    problems.extend(denylist_problems)
    if text:
        problems.extend(_text_problems(text))

    assets_root = workspace / "_private" / "assets"
    asset_names = [
        path.relative_to(assets_root).as_posix()
        for path in _asset_files(assets_root)
    ]
    problems.extend(_denylist_problems(text, asset_names, patterns))

    referenced_assets: List[Path] = []
    if text:
        referenced_assets, link_problems = _collect_asset_targets(
            text,
            assets_root,
        )
        problems.extend(link_problems)

    all_assets = _asset_files(assets_root)
    if all_assets:
        if not confirm_visual_review:
            problems.append("附件画面尚未确认")
        exiftool = shutil.which("exiftool")
        if exiftool:
            problems.extend(_inspect_metadata(all_assets, exiftool))
        elif not confirm_metadata_review:
            problems.append(
                "附件元数据尚未确认：未找到 exiftool，需显式人工确认"
            )

    return list(dict.fromkeys(problems))


def _strip_metadata(files: List[Path], exiftool: str) -> None:
    for path in files:
        result = subprocess.run(
            [exiftool, "-overwrite_original", "-all=", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or f"退出码 {result.returncode}"
            raise ValueError(f"exiftool 清除元数据失败：{detail}")


def _validate_publish_tree(
    publish_tree: Path,
    patterns: List[Pattern[str]],
    exiftool: Optional[str],
) -> List[str]:
    problems: List[str] = []
    for path in [publish_tree] + list(publish_tree.rglob("*")):
        if path.is_symlink():
            problems.append(f"临时发布树存在符号链接：{path}")

    article = publish_tree / "article.md"
    if not article.is_file() or article.is_symlink():
        return problems + ["临时发布稿 article.md 缺失或不是普通文件"]
    text = article.read_text(encoding="utf-8")
    if not text.strip():
        problems.append("临时发布稿为空")
    problems.extend(_text_problems(text))

    assets_root = publish_tree / "assets"
    asset_files = _asset_files(assets_root)
    asset_names = [
        path.relative_to(assets_root).as_posix() for path in asset_files
    ]
    problems.extend(_denylist_problems(text, asset_names, patterns))
    _, link_problems = _collect_asset_targets(text, assets_root)
    problems.extend(link_problems)
    if exiftool:
        problems.extend(_inspect_metadata(asset_files, exiftool))
    return list(dict.fromkeys(problems))


def _write_ready_metadata(
    workspace: Path,
    metadata: dict,
    has_assets: bool,
    exiftool: Optional[str],
    confirm_visual_review: bool,
    confirm_metadata_review: bool,
) -> None:
    updated = dict(metadata)
    updated["status"] = "ready"
    updated["updated_at"] = date.today().isoformat()
    if has_assets:
        updated["assets_visual_reviewed"] = confirm_visual_review
        updated["assets_metadata_reviewed"] = bool(
            exiftool or confirm_metadata_review
        )
        updated["assets_metadata_tool"] = (
            "exiftool" if exiftool else "manual"
        )

    next_meta = workspace / f"._meta-next-{uuid.uuid4().hex}.json"
    try:
        next_meta.write_text(
            json.dumps(updated, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(next_meta, workspace / "_meta.json")
    finally:
        if next_meta.exists():
            next_meta.unlink()


def promote_candidate(
    workspace: Path,
    articles_root: Path,
    denylist: Optional[Path],
    replace: bool = False,
    strict: bool = True,
    confirm_missing_denylist: bool = False,
    confirm_visual_review: bool = False,
    confirm_metadata_review: bool = False,
) -> Path:
    """通过检查后将候选稿原子提升为 publish/article.md。"""
    workspace = Path(workspace)
    articles_root = Path(articles_root)
    problems = validate_candidate(
        workspace,
        articles_root,
        denylist,
        strict=strict,
        confirm_missing_denylist=confirm_missing_denylist,
        confirm_visual_review=confirm_visual_review,
        confirm_metadata_review=confirm_metadata_review,
    )
    if problems:
        raise ValueError("；".join(problems))

    publish_dir = workspace / "publish"
    if publish_dir.exists() and not replace:
        raise ValueError("publish 已存在；显式传入 replace=True 才能替换")
    if publish_dir.is_symlink():
        raise ValueError("publish 不能是符号链接")

    metadata, metadata_problems = _load_metadata(workspace)
    if metadata_problems:
        raise ValueError("；".join(metadata_problems))

    candidate = workspace / "_private" / "candidate.md"
    private_assets = workspace / "_private" / "assets"
    text = candidate.read_text(encoding="utf-8")
    referenced_assets, link_problems = _collect_asset_targets(
        text,
        private_assets,
    )
    if link_problems:
        raise ValueError("；".join(link_problems))

    patterns, deny_problems = load_deny_patterns(
        denylist,
        strict,
        confirm_missing_denylist,
    )
    if deny_problems:
        raise ValueError("；".join(deny_problems))

    exiftool = shutil.which("exiftool") if referenced_assets else None
    temp_dir = workspace / f".publish-next-{uuid.uuid4().hex}"
    backup_dir: Optional[Path] = None
    published = False
    try:
        temp_dir.mkdir()
        shutil.copy2(candidate, temp_dir / "article.md")
        copied_assets: List[Path] = []
        for source in referenced_assets:
            relative = source.relative_to(private_assets)
            destination = temp_dir / "assets" / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination, follow_symlinks=False)
            copied_assets.append(destination)

        if copied_assets and exiftool:
            _strip_metadata(copied_assets, exiftool)

        publish_problems = _validate_publish_tree(
            temp_dir,
            patterns,
            exiftool,
        )
        if publish_problems:
            raise ValueError("；".join(publish_problems))

        if publish_dir.exists():
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            backup_dir = (
                workspace
                / "_private"
                / f"publish-backup-{timestamp}-{uuid.uuid4().hex[:8]}"
            )
            os.replace(publish_dir, backup_dir)

        try:
            os.replace(temp_dir, publish_dir)
            published = True
        except Exception:
            if backup_dir and backup_dir.exists() and not publish_dir.exists():
                os.replace(backup_dir, publish_dir)
            raise

        try:
            _write_ready_metadata(
                workspace,
                metadata,
                bool(referenced_assets),
                exiftool,
                confirm_visual_review,
                confirm_metadata_review,
            )
        except Exception:
            if published and publish_dir.exists():
                shutil.rmtree(publish_dir)
                published = False
            if backup_dir and backup_dir.exists():
                os.replace(backup_dir, publish_dir)
            raise
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

    return publish_dir / "article.md"


def build_parser() -> argparse.ArgumentParser:
    repo_root = Path(__file__).resolve().parents[4]
    parser = argparse.ArgumentParser(
        description="检查或发布经验分享文章候选稿"
    )
    parser.add_argument("workspace", type=Path, help="文章工作区")
    parser.add_argument(
        "--articles-root",
        type=Path,
        default=repo_root / "output" / "sharing" / "articles",
        help="文章根目录",
    )
    parser.add_argument(
        "--denylist",
        type=Path,
        default=repo_root / "scripts" / ".share-denylist",
        help="一行一个正则的敏感词清单",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        default=True,
        help="严格模式（默认开启）",
    )
    parser.add_argument(
        "--confirm-missing-denylist",
        action="store_true",
        help="显式确认 denylist 缺失或为空",
    )
    parser.add_argument(
        "--confirm-visual-review",
        action="store_true",
        help="显式确认附件画面已人工检查",
    )
    parser.add_argument(
        "--confirm-metadata-review",
        action="store_true",
        help="无 exiftool 时显式确认附件元数据已人工检查",
    )
    parser.add_argument(
        "--promote",
        action="store_true",
        help="检查通过后发布",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="允许替换已有发布稿并保留私有备份",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.promote:
        try:
            publish = promote_candidate(
                args.workspace,
                args.articles_root,
                args.denylist,
                replace=args.replace,
                strict=args.strict,
                confirm_missing_denylist=args.confirm_missing_denylist,
                confirm_visual_review=args.confirm_visual_review,
                confirm_metadata_review=args.confirm_metadata_review,
            )
        except (OSError, UnicodeError, ValueError) as exc:
            print(f"❌ {exc}", file=sys.stderr)
            return 1
        print(f"文章发布检查通过：{publish}")
        return 0

    problems = validate_candidate(
        args.workspace,
        args.articles_root,
        args.denylist,
        strict=args.strict,
        confirm_missing_denylist=args.confirm_missing_denylist,
        confirm_visual_review=args.confirm_visual_review,
        confirm_metadata_review=args.confirm_metadata_review,
    )
    if problems:
        for problem in problems:
            print(f"❌ {problem}", file=sys.stderr)
        return 1
    print("候选稿检查通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
