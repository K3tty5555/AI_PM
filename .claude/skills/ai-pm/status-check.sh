#!/bin/bash
# AI_PM 多项目进度检测脚本

OUTPUT_DIR="./output"
PROJECTS_DIR="$OUTPUT_DIR/projects"
CURRENT_PROJECT_FILE="$OUTPUT_DIR/.current-project"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 阶段定义（用于仪表盘）
STAGE_FILES=(
    "01-requirement-draft.md"
    "02-analysis-report.md"
    "03-competitor-report.md"
    "04-user-stories.md"
    "05-prd"
    "06-prototype"
)
STAGE_NAMES=(
    "需求澄清"
    "需求分析"
    "竞品研究"
    "用户故事"
    "PRD生成"
    "原型生成"
)
STAGE_COMMANDS=(
    "/ai-pm analyze"
    "/ai-pm research"
    "/ai-pm story"
    "/ai-pm prd"
    "/ai-pm prototype"
    "完成"
)

# 获取当前项目
get_current_project() {
    if [ -f "$CURRENT_PROJECT_FILE" ]; then
        cat "$CURRENT_PROJECT_FILE"
    else
        echo ""
    fi
}

# 显示仪表盘（避免在case中使用local）
show_dashboard() {
    local current_project=$(get_current_project)

    if [ -z "$current_project" ]; then
        # 没有当前项目 - 显示引导页
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🚀 欢迎来到 AI 产品经理"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "我是你的 AI 产品合伙人，可以帮你："
        echo ""
        echo "✅ 将一句话需求转化为完整 PRD"
        echo "✅ 生成可交互网页原型"
        echo "✅ 进行竞品分析和数据设计"
        echo "✅ 模拟需求评审，提前发现问题"
        echo ""

        # 检查是否已有项目
        if [ -d "$PROJECTS_DIR" ] && [ "$(ls -A "$PROJECTS_DIR" 2>/dev/null)" ]; then
            echo "📁 检测到你已有项目，输入 /ai-pm list 查看"
            echo ""
        fi

        echo "🎯 快速开始（直接输入）："
        echo ""
        echo "1️⃣ 一句话需求"
        echo "   💬 例：做一个帮用户决定吃什么的 App"
        echo ""
        echo "2️⃣ 查看项目列表"
        echo "   📋 /ai-pm list"
        echo ""
        echo "3️⃣ 管理写作风格"
        echo "   📝 /ai-pm writing-style"
        echo ""
        echo "4️⃣ 管理设计规范"
        echo "   🎨 /ai-pm ui-spec"
        echo ""
    else
        # 有当前项目 - 显示仪表盘
        local project_dir="$PROJECTS_DIR/$current_project"

        if [ ! -d "$project_dir" ]; then
            echo "⚠️ 当前项目 '$current_project' 不存在"
            rm -f "$CURRENT_PROJECT_FILE"
            exit 1
        fi

        # 获取进度
        local completed next_stage
        read completed next_stage < <(get_project_progress "$project_dir")
        local total=${#STAGE_FILES[@]}

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📁 项目：${BOLD}$current_project${NC}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        # 渲染阶段流程图
        render_stage_flow $completed $total

        # 显示进度条
        echo "   总进度：$(render_progress_bar $completed $total)"
        echo ""

        # 显示已完成列表
        if [ $completed -gt 0 ]; then
            echo "📋 已完成："
            local i file prd_file size
            for ((i=0; i<completed; i++)); do
                file="${STAGE_FILES[$i]}"
                if [[ "$file" == "05-prd" ]]; then
                    prd_file=$(ls -t "$project_dir"/05-prd/05-PRD-*.md 2>/dev/null | head -1)
                    if [ -n "$prd_file" ]; then
                        size=$(ls -lh "$prd_file" 2>/dev/null | awk '{print $5}')
                        echo "   ${GREEN}✓${NC} ${STAGE_NAMES[$i]} (${size})"
                    fi
                elif [[ "$file" == "06-prototype" ]]; then
                    echo "   ${GREEN}✓${NC} ${STAGE_NAMES[$i]}"
                else
                    if [ -f "$project_dir/$file" ]; then
                        size=$(ls -lh "$project_dir/$file" 2>/dev/null | awk '{print $5}')
                        echo "   ${GREEN}✓${NC} ${STAGE_NAMES[$i]} (${size})"
                    fi
                fi
            done
            echo ""
        fi

        # 显示下一步
        if [ $next_stage -lt $total ]; then
            echo "⏳ 下一步：${STAGE_NAMES[$next_stage]}"
            echo ""
        else
            echo -e "${GREEN}🎉 所有阶段已完成！${NC}"
            echo ""
        fi

        # 显示快捷操作
        render_quick_actions $next_stage "$project_dir"
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# 获取项目进度详情（返回完成数量和下一个阶段索引）
get_project_progress() {
    local project_dir=$1
    local completed=0
    local next_stage=0

    for i in "${!STAGE_FILES[@]}"; do
        local file_pattern="${STAGE_FILES[$i]}"
        local found=0

        if [[ "$file_pattern" == "05-prd" ]]; then
            if ls "$project_dir"/05-prd/05-PRD-*.md 1> /dev/null 2>&1; then
                found=1
            fi
        elif [[ "$file_pattern" == "06-prototype" ]]; then
            if [ -d "$project_dir/06-prototype" ] && [ -f "$project_dir/06-prototype/index.html" ]; then
                found=1
            fi
        else
            if [ -f "$project_dir/$file_pattern" ]; then
                found=1
            fi
        fi

        if [ $found -eq 1 ]; then
            ((completed++))
        elif [ $next_stage -eq 0 ]; then
            next_stage=$i
        fi
    done

    # 如果全部完成
    if [ $completed -eq ${#STAGE_FILES[@]} ]; then
        next_stage=${#STAGE_FILES[@]}
    fi

    echo "$completed $next_stage"
}

# 渲染进度条
render_progress_bar() {
    local completed=$1
    local total=$2
    local percentage=$((completed * 100 / total))
    local filled=$((completed * 20 / total))
    local empty=$((20 - filled))

    local bar=""
    for ((i=0; i<filled; i++)); do
        bar="${bar}█"
    done
    for ((i=0; i<empty; i++)); do
        bar="${bar}░"
    done

    echo "$bar $percentage%"
}

# 渲染阶段流程图
render_stage_flow() {
    local completed=$1
    local total=$2
    local flow=""

    echo ""
    echo "📊 阶段进度："
    echo ""

    # 第一行：阶段1-3
    for ((i=0; i<3 && i<total; i++)); do
        if [ $i -lt $completed ]; then
            echo -n "  ${GREEN}[✅]${NC} ${STAGE_NAMES[$i]}"
        else
            echo -n "  ${YELLOW}[⏳]${NC} ${STAGE_NAMES[$i]}"
        fi
        if [ $i -lt 2 ]; then
            echo -n "  →  "
        fi
    done
    echo ""

    # 连接符
    if [ $total -gt 3 ]; then
        echo "                    ↓"
    fi

    # 第二行：阶段4-6（倒序）
    if [ $total -gt 3 ]; then
        for ((i=total-1; i>=3; i--)); do
            if [ $i -lt $completed ]; then
                echo -n "  ${GREEN}[✅]${NC} ${STAGE_NAMES[$i]}"
            else
                echo -n "  ${YELLOW}[⏳]${NC} ${STAGE_NAMES[$i]}"
            fi
            if [ $i -gt 4 ]; then
                echo -n "  ←  "
            elif [ $i -eq 4 ]; then
                echo -n "  ←──┘"
            fi
        done
        echo ""
    fi
    echo ""
}

# 显示快捷操作提示
render_quick_actions() {
    local next_stage=$1
    local project_dir=$2

    echo "💡 快捷操作："
    echo ""

    # 根据当前阶段显示不同的快捷操作
    if [ $next_stage -eq 0 ]; then
        echo "   • 输入 ${BOLD}继续${NC} 或 ${BOLD}go${NC} → 开始需求分析"
        echo "   • 输入 ${BOLD}跳过${NC} → 跳过需求澄清，直接生成PRD"
    elif [ $next_stage -lt ${#STAGE_FILES[@]} ]; then
        echo "   • 输入 ${BOLD}继续${NC} 或 ${BOLD}go${NC} → ${STAGE_NAMES[$next_stage]}"
        echo "   • 输入 ${BOLD}跳过${NC} → 跳过${STAGE_NAMES[$next_stage]}"
    else
        echo "   • 输入 ${BOLD}看PRD${NC} → 查看PRD文档"
        echo "   • 输入 ${BOLD}看原型${NC} → 查看原型"
        echo "   • 输入 ${BOLD}评审${NC} → 开始需求评审"
    fi

    # 通用的快捷操作
    echo "   • 输入 ${BOLD}状态${NC} → 查看项目状态"
    echo "   • 输入 ${BOLD}列表${NC} → 查看所有项目"
    echo ""
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
    echo "  dashboard           显示项目仪表盘 (默认)"
    echo "  status              显示当前项目状态 (兼容模式)"
    echo "  list                列出所有项目"
    echo "  switch <项目名>      切换到指定项目"
    echo "  create <项目名>      创建新项目"
    echo "  delete <项目名>      删除项目"
    echo ""
}

# 主逻辑
case "${1:-dashboard}" in
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

    "dashboard"|"")
        show_dashboard
        ;;

    "status")
        # 保留旧的 status 命令用于兼容
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📊 AI_PM 项目状态"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        _current_project=$(get_current_project)

        if [ -z "$_current_project" ]; then
            echo "⚠️ 当前没有选中项目"
            echo ""
            echo "可用命令:"
            echo "   /ai-pm list              # 查看所有项目"
            echo "   /ai-pm switch {项目名}    # 切换项目"
            echo "   /ai-pm new {项目名}       # 创建新项目"
            echo "   /ai-pm \"需求描述\"        # 创建项目并开始"
        else
            _project_dir="$PROJECTS_DIR/$_current_project"

            if [ ! -d "$_project_dir" ]; then
                echo "⚠️ 当前项目 '$_current_project' 不存在"
                rm -f "$CURRENT_PROJECT_FILE"
                exit 1
            fi

            check_project_progress "$_project_dir"

            _completed=$?
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""

            if [ $_completed -eq 5 ]; then
                echo -e "${GREEN}🎉 所有阶段已完成！${NC}"
                echo ""
                echo "📄 产出文件:"
                ls -1 "$_project_dir"/*.md 2>/dev/null | while read file; do
                    _size=$(ls -lh "$file" | awk '{print $5}')
                    echo "   $(basename "$file") ($_size)"
                done
            else
                echo "🔄 继续命令:"
                echo "   /ai-pm          # 从断点继续"
                case $_completed in
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
        # 未知命令但可能是快捷指令，默认显示仪表盘
        show_dashboard
        ;;
esac
