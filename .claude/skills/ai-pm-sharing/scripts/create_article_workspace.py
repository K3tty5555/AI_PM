#!/usr/bin/env python3
"""为经验分享文章创建私有工作区。"""

from __future__ import annotations

import argparse
import json
import unicodedata
from datetime import date
from pathlib import Path
from typing import Optional


MAX_TOPIC_LENGTH = 60


def sanitize_topic(topic: str) -> str:
    """把用户主题转为可读且不能穿越目录的短名称。"""
    normalized = unicodedata.normalize("NFKC", topic).strip()
    pieces: list[str] = []
    pending_dash = False

    for char in normalized:
        if char.isalnum():
            if pending_dash and pieces:
                pieces.append("-")
            pieces.append(char)
            pending_dash = False
        else:
            pending_dash = bool(pieces)

    slug = "".join(pieces).strip("-")[:MAX_TOPIC_LENGTH].rstrip("-")
    if not slug:
        raise ValueError("主题不能为空或不含可用文字")
    return slug


def create_workspace(
    repo_root: Path, topic: str, today: Optional[date] = None
) -> Path:
    """创建不覆盖既有内容的文章工作区，并返回绝对路径。"""
    if repo_root.is_symlink():
        raise ValueError("仓库根目录不能是符号链接")

    repo = repo_root.resolve()
    current = repo
    for part in ("output", "sharing", "articles"):
        current = current / part
        if current.is_symlink():
            raise ValueError(f"文章目录路径不能包含符号链接：{current}")

    articles_root = current.resolve()
    if not articles_root.is_relative_to(repo):
        raise ValueError("output/sharing/articles 超出仓库根目录")
    articles_root.mkdir(parents=True, exist_ok=True)

    current_date = today or date.today()
    date_text = current_date.isoformat()
    base_name = f"{date_text}-{sanitize_topic(topic)}"
    index = 1

    while True:
        suffix = "" if index == 1 else f"-{index:02d}"
        workspace = (articles_root / f"{base_name}{suffix}").resolve()
        if not workspace.is_relative_to(articles_root):
            raise ValueError("文章目录超出 output/sharing/articles")
        try:
            workspace.mkdir(parents=False, exist_ok=False)
            break
        except FileExistsError:
            index += 1

    (workspace / "_private" / "assets").mkdir(parents=True)
    metadata = {
        "content_type": "article",
        "status": "draft",
        "title": topic.strip(),
        "created_at": date_text,
        "updated_at": date_text,
        "assets_visual_reviewed": False,
        "assets_metadata_reviewed": False,
        "assets_metadata_tool": None,
    }
    (workspace / "_meta.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return workspace


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="创建经验分享文章私有工作区")
    parser.add_argument("topic", help="文章主题")
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[4],
        help="仓库根目录；默认从当前脚本位置推导",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        workspace = create_workspace(args.repo_root, args.topic)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(workspace)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
