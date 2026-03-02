#!/bin/bash
# AI_PM 多项目进度检测脚本

OUTPUT_DIR="./output"
PROJECTS_DIR="$OUTPUT_DIR/projects"
CURRENT_PROJECT_FILE="$OUTPUT_DIR/.current-project"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# 获取当前项目
get_current_project() {
    if [ -f "$CURRENT_PROJECT_FILE" ]; then
        cat "$CURRENT_PROJECT_FILE"
    else
        echo ""
    fi
}

# 检查项目进度
check_project_progress() {
    local project_dir=$1
    local project_name=$(basename "$project_dir")
    local completed=0
    local total=5
    local stage_files=(
        "01-requirement-draft.md"
        "02-analysis-report.md"
        "03-competitor-report.md"
        "04-user-stories.md"
        "05-prd"
    )
    local stage_names=(
        "需求澄清"
        "需求分析"
        "竞品研究"
        "用户故事"
        "PRD生成"
    )

    echo ""
    echo "📁 项目: $project_name"
    echo "   路径: $project_dir"
    echo ""

    for i in "${!stage_files[@]}"; do
        local file_pattern="${stage_files[$i]}"
        local stage_name="${stage_names[$i]}"
        local stage_num=$((i + 1))

        # 检查文件是否存在（PRD在子目录中）
        if [[ "$file_pattern" == "05-prd" ]]; then
            if ls "$project_dir"/05-prd/05-PRD-*.md 1> /dev/null 2>&1; then
                local file=$(ls -t "$project_dir"/05-prd/05-PRD-*.md | head -1)
                local size=$(ls -lh "$file" 2>/dev/null | awk '{print $5}')
                local mtime=$(stat -f "%Sm" -t "%m-%d %H:%M" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1)
                echo -e "   ${GREEN}✅${NC} 阶段 $stage_num: $stage_name (${size}, ${mtime})"
                ((completed++))
            else
                echo -e "   ${YELLOW}⏳${NC} 阶段 $stage_num: $stage_name"
            fi
        else
            local file="$project_dir/$file_pattern"
            if [ -f "$file" ]; then
                local size=$(ls -lh "$file" 2>/dev/null | awk '{print $5}')
                local mtime=$(stat -f "%Sm" -t "%m-%d %H:%M" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1)
                echo -e "   ${GREEN}✅${NC} 阶段 $stage_num: $stage_name (${size}, ${mtime})"
                ((completed++))
            else
                echo -e "   ${YELLOW}⏳${NC} 阶段 $stage_num: $stage_name"
            fi
        fi
    done

    local progress=$((completed * 100 / total))
    echo ""
    echo "   进度: $progress% ($completed/$total)"

    return $completed
}

# 显示帮助
show_help() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 AI_PM 项目管理工具"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "用法: status-check.sh [命令] [参数]"
    echo ""
    echo "命令:"
    echo "  status              显示当前项目状态 (默认)"
    echo "  list                列出所有项目"
    echo "  switch <项目名>      切换到指定项目"
    echo "  create <项目名>      创建新项目"
    echo "  delete <项目名>      删除项目"
    echo ""
}

# 主逻辑
case "${1:-status}" in
    "help"|"-h"|"--help")
        show_help
        ;;

    "list"|"ls")
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📁 AI_PM 项目列表"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        if [ ! -d "$PROJECTS_DIR" ]; then
            echo "❌ 还没有创建任何项目"
            echo ""
            echo "创建项目:"
            echo "   /ai-pm new {项目名}"
            echo "   或 /ai-pm \"你的需求描述\""
            exit 0
        fi

        local current_project=$(get_current_project)
        local project_count=0

        for project_dir in "$PROJECTS_DIR"/*; do
            if [ -d "$project_dir" ]; then
                ((project_count++))
                local project_name=$(basename "$project_dir")
                local completed=0
                local total=5

                # 快速计算进度
                [ -f "$project_dir/01-requirement-draft.md" ] && ((completed++))
                [ -f "$project_dir/02-analysis-report.md" ] && ((completed++))
                [ -f "$project_dir/03-competitor-report.md" ] && ((completed++))
                [ -f "$project_dir/04-user-stories.md" ] && ((completed++))
                ls "$project_dir"/05-prd/05-PRD-*.md 1>/dev/null 2>&1 && ((completed++))

                local progress=$((completed * 100 / total))

                if [ "$project_name" = "$current_project" ]; then
                    echo -e "${BLUE}▶${NC} $project_name - ${progress}% (当前项目)"
                else
                    echo "  $project_name - ${progress}%"
                fi
            fi
        done

        if [ $project_count -eq 0 ]; then
            echo "❌ 还没有创建任何项目"
        else
            echo ""
            echo "共 $project_count 个项目"
        fi

        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ;;

    "switch"|"sw")
        local project_name="$2"
        if [ -z "$project_name" ]; then
            echo "❌ 请指定项目名称"
            echo "用法: status-check.sh switch {项目名}"
            exit 1
        fi

        local project_dir="$PROJECTS_DIR/$project_name"
        if [ ! -d "$project_dir" ]; then
            echo "❌ 项目 '$project_name' 不存在"
            echo "可用项目:"
            "$0" list
            exit 1
        fi

        echo "$project_name" > "$CURRENT_PROJECT_FILE"
        echo "✅ 已切换到项目: $project_name"
        ;;

    "create"|"new")
        local project_name="$2"
        if [ -z "$project_name" ]; then
            echo "❌ 请指定项目名称"
            echo "用法: status-check.sh create {项目名}"
            exit 1
        fi

        # 清理项目名（移除特殊字符）
        project_name=$(echo "$project_name" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9_-')

        local project_dir="$PROJECTS_DIR/$project_name"

        if [ -d "$project_dir" ]; then
            echo "⚠️ 项目 '$project_name' 已存在"
            read -p "是否覆盖? (y/N): " confirm
            if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
                echo "取消创建"
                exit 0
            fi
            rm -rf "$project_dir"
        fi

        mkdir -p "$project_dir"
        echo "$project_name" > "$CURRENT_PROJECT_FILE"
        echo "✅ 创建项目: $project_name"
        echo "   路径: $project_dir"
        ;;

    "delete"|"rm")
        local project_name="$2"
        if [ -z "$project_name" ]; then
            echo "❌ 请指定项目名称"
            exit 1
        fi

        local project_dir="$PROJECTS_DIR/$project_name"
        if [ ! -d "$project_dir" ]; then
            echo "❌ 项目 '$project_name' 不存在"
            exit 1
        fi

        read -p "确定删除项目 '$project_name'? 此操作不可恢复! (y/N): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            rm -rf "$project_dir"
            echo "✅ 已删除项目: $project_name"

            # 如果删除的是当前项目，清空当前项目记录
            local current_project=$(get_current_project)
            if [ "$current_project" = "$project_name" ]; then
                rm -f "$CURRENT_PROJECT_FILE"
            fi
        else
            echo "取消删除"
        fi
        ;;

    "status"|"")
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📊 AI_PM 项目状态"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        local current_project=$(get_current_project)

        if [ -z "$current_project" ]; then
            echo "⚠️ 当前没有选中项目"
            echo ""
            echo "可用命令:"
            echo "   /ai-pm list              # 查看所有项目"
            echo "   /ai-pm switch {项目名}    # 切换项目"
            echo "   /ai-pm new {项目名}       # 创建新项目"
            echo "   /ai-pm \"需求描述\"        # 创建项目并开始"
        else
            local project_dir="$PROJECTS_DIR/$current_project"

            if [ ! -d "$project_dir" ]; then
                echo "⚠️ 当前项目 '$current_project' 不存在"
                rm -f "$CURRENT_PROJECT_FILE"
                exit 1
            fi

            check_project_progress "$project_dir"

            local completed=$?
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""

            if [ $completed -eq 5 ]; then
                echo -e "${GREEN}🎉 所有阶段已完成！${NC}"
                echo ""
                echo "📄 产出文件:"
                ls -1 "$project_dir"/*.md 2>/dev/null | while read file; do
                    local size=$(ls -lh "$file" | awk '{print $5}')
                    echo "   $(basename "$file") ($size)"
                done
            else
                echo "🔄 继续命令:"
                echo "   /ai-pm          # 从断点继续"
                case $completed in
                    0) echo "   /ai-pm analyze  # 需求分析" ;;
                    1) echo "   /ai-pm analyze  # 需求分析" ;;
                    2) echo "   /ai-pm research # 竞品研究" ;;
                    3) echo "   /ai-pm story    # 用户故事" ;;
                    4) echo "   /ai-pm prd      # 生成 PRD" ;;
                esac
            fi
        fi

        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ;;

    *)
        echo "❌ 未知命令: $1"
        show_help
        exit 1
        ;;
esac
