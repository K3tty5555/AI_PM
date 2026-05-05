#!/usr/bin/env bash
set -e

KB_DIR="templates/knowledge-base"
ARCHIVE_DIR="$KB_DIR/.archived"
mkdir -p "$ARCHIVE_DIR"

case "${1:-help}" in
  --all-drop)
    # 紧急回滚：全删 auto-generated 卡片
    COUNT=$(grep -rl 'auto-generated: true' "$KB_DIR" 2>/dev/null | wc -l | tr -d ' ')
    echo "将删除 $COUNT 张 auto-generated 卡片"
    read -p "确认？(y/N) " yn
    [[ "$yn" == "y" ]] || { echo "取消"; exit 0; }
    grep -rl 'auto-generated: true' "$KB_DIR" 2>/dev/null | xargs rm -v
    ;;

  --archive-stale)
    # 归档：超过 N 天未被 search 命中的 auto+low 卡片
    DAYS="${2:-7}"
    echo "归档超过 $DAYS 天未修改的 auto+low 卡片到 $ARCHIVE_DIR"
    find "$KB_DIR" -name '*.md' -mtime +"$DAYS" \
      -exec grep -l 'auto-generated: true' {} \; \
      -exec grep -l 'confidence: low' {} \; \
      -exec mv {} "$ARCHIVE_DIR/" \;
    ;;

  *)
    cat <<USAGE
用法：
  cleanup-auto-cards.sh --all-drop                  # 紧急回滚，全删
  cleanup-auto-cards.sh --archive-stale [DAYS=7]    # 归档 N 天未动的 auto+low
USAGE
    ;;
esac
