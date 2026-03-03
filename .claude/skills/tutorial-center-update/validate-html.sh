#!/bin/bash
# 教程中心 HTML 验证脚本
# 验证纯原生、零依赖架构

set -e

HTML_FILE="${1:-AI_PM_教程中心.html}"
ERRORS=0
WARNINGS=0

echo "======================================"
echo "   教程中心 HTML 验证 (v3.0)"
echo "======================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. 文件存在检查
echo "📄 文件存在检查"
if [ ! -f "$HTML_FILE" ]; then
    echo -e "${RED}❌ 文件不存在: $HTML_FILE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 文件存在${NC}"

# 2. 零依赖检查
echo ""
echo "🔗 零依赖检查"

DEP_PATTERNS=(
    "vue.global.js:Vue"
    "react:React"
    "angular:Angular"
    "unpkg.com:CDN依赖"
    "cdnjs.cloudflare.com:CDN依赖"
    "jsdelivr.net:CDN依赖"
)

for pattern_def in "${DEP_PATTERNS[@]}"; do
    IFS=':' read -r pattern name <<< "$pattern_def"
    if ! grep -q "$pattern" "$HTML_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓ 无${name}${NC}"
    else
        echo -e "${RED}❌ 发现${name}${NC}"
        ERRORS=$((ERRORS+1))
    fi
done

# 3. 原生 JS 检查
echo ""
echo "🔧 原生 JS 检查"

JS_CHECKS=(
    "IIFE封装:(function()"
    "严格模式:use strict"
    "switchTab:switchTab"
    "IntersectionObserver:IntersectionObserver"
    "键盘导航:ArrowRight"
    "触摸支持:touchstart"
    "滚动监听:scroll"
    "transform动画:scaleX"
)

for check_def in "${JS_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check_def"
    if grep -q "$pattern" "$HTML_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓ ${name}${NC}"
    else
        echo -e "${RED}❌ ${name} 缺失${NC}"
        ERRORS=$((ERRORS+1))
    fi
done

# 4. Tab 系统检查
echo ""
echo "📑 Tab 系统检查"

TAB_CHECKS=(
    "导航栏:nav-tab"
    "Tab面板:tab-panel"
    "进度条:progress-bar"
    "主题色切换:--accent"
    "激活状态:.active"
)

for check_def in "${TAB_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check_def"
    if grep -q "$pattern" "$HTML_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓ ${name}${NC}"
    else
        echo -e "${RED}❌ ${name} 缺失${NC}"
        ERRORS=$((ERRORS+1))
    fi
done

# 检查是否有5个Tab
TAB_COUNT=$(grep -o 'data-tab="[0-9]"' "$HTML_FILE" 2>/dev/null | sort -u | wc -l || echo "0")
if [ "$TAB_COUNT" -ge 5 ]; then
    echo -e "${GREEN}✓ 5个Tab (${TAB_COUNT}个)${NC}"
else
    echo -e "${YELLOW}⚠ Tab数量不足 (${TAB_COUNT}个)${NC}"
    WARNINGS=$((WARNINGS+1))
fi

# 5. CSS 动画检查
echo ""
echo "✨ CSS 动画检查"

CSS_CHECKS=(
    "Scroll Reveal:.reveal"
    "visible类:.visible"
    "CSS变量::root"
    "过渡动画:transition"
    "transform:transform"
    "透明度过渡:opacity"
)

for check_def in "${CSS_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check_def"
    if grep -q "$pattern" "$HTML_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓ ${name}${NC}"
    else
        echo -e "${YELLOW}⚠ ${name} 可能缺失${NC}"
        WARNINGS=$((WARNINGS+1))
    fi
done

# 6. 数据结构检查
echo ""
echo "📊 数据结构检查"

DATA_CHECKS=(
    "SKILLS_DATA"
    "SKILL_USAGE"
)

for check in "${DATA_CHECKS[@]}"; do
    if grep -q "$check" "$HTML_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓ ${check}${NC}"
    else
        echo -e "${YELLOW}⚠ ${check} 可能缺失${NC}"
        WARNINGS=$((WARNINGS+1))
    fi
done

# 统计技能数量
SKILL_COUNT=$(grep -oE 'name\s*:\s*"[^"]+"' "$HTML_FILE" 2>/dev/null | wc -l || echo "0")
echo -e "${GREEN}✓ 技能数量: ${SKILL_COUNT}${NC}"

# 7. 无障碍检查
echo ""
echo "♿ 无障碍检查"

A11Y_CHECKS=(
    "role属性:role="
    "aria属性:aria-"
    "noscript:noscript"
)

for check_def in "${A11Y_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check_def"
    if grep -q "$pattern" "$HTML_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓ ${name}${NC}"
    else
        echo -e "${YELLOW}⚠ ${name} (建议添加)${NC}"
    fi
done

# 8. HTML 结构检查
echo ""
echo "🏗️ HTML 结构检查"

STRUCT_CHECKS=(
    "DOCTYPE:<!DOCTYPE html"
    "HTML标签:<html"
    "Head标签:<head>"
    "Body标签:<body>"
    "Meta Charset:<meta charset"
    "Viewport:<meta name=\"viewport\""
    "Title标签:<title>"
    "Style标签:<style>"
    "Script标签:<script>"
)

for check_def in "${STRUCT_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check_def"
    if grep -q "$pattern" "$HTML_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓ ${name}${NC}"
    else
        echo -e "${RED}❌ ${name} 缺失${NC}"
        ERRORS=$((ERRORS+1))
    fi
done

# 9. 文件大小检查
echo ""
echo "📏 文件大小检查"
SIZE=$(wc -c < "$HTML_FILE")
SIZE_KB=$((SIZE / 1024))
if [ $SIZE -gt 512000 ]; then
    echo -e "${YELLOW}⚠ 文件较大: ${SIZE_KB}KB (>500KB)${NC}"
    WARNINGS=$((WARNINGS+1))
else
    echo -e "${GREEN}✓ 文件大小: ${SIZE_KB}KB${NC}"
fi

# 10. 离线可用性检查
echo ""
echo "🔌 离线可用性检查"

# 检查是否有外部资源
EXTERNAL_REFS=$(grep -oE '(src|href)="https?://[^"]+"' "$HTML_FILE" 2>/dev/null | wc -l || echo "0")
if [ "$EXTERNAL_REFS" -eq 0 ]; then
    echo -e "${GREEN}✓ 完全离线可用 (0个外部资源)${NC}"
else
    echo -e "${YELLOW}⚠ 发现 ${EXTERNAL_REFS} 个外部引用${NC}"
    WARNINGS=$((WARNINGS+1))
fi

# 总结
echo ""
echo "======================================"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ 所有检查通过！${NC}"
    echo -e "${GREEN}HTML 文件完全独立，零依赖，可离线运行${NC}"
    echo "======================================"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ 发现 ${WARNINGS} 个警告，但无严重错误${NC}"
    echo "======================================"
    exit 0
else
    echo -e "${RED}❌ 发现 ${ERRORS} 个错误，${WARNINGS} 个警告${NC}"
    echo "======================================"
    exit 1
fi
