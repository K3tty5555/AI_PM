#!/bin/bash

# Agent Team CLI
# 用于启动和管理 Agent Team 多代理协作项目

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${AI_PM_ROOT:-}" ]; then
    if AI_PM_GIT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
        AI_PM_ROOT="$AI_PM_GIT_ROOT"
    else
        SEARCH_DIR="$SCRIPT_DIR"
        while [ "$SEARCH_DIR" != "/" ]; do
            if [ -f "$SEARCH_DIR/README.md" ] && [ -d "$SEARCH_DIR/.claude" ]; then
                AI_PM_ROOT="$SEARCH_DIR"
                break
            fi
            SEARCH_DIR="$(dirname "$SEARCH_DIR")"
        done
        AI_PM_ROOT="${AI_PM_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
    fi
fi
PROJECTS_DIR="${AI_PM_PROJECTS_DIR:-$AI_PM_ROOT/output/projects}"
TEMPLATES_DIR="${AI_PM_AGENT_TEMPLATES_DIR:-$AI_PM_ROOT/templates/agent-team}"

# 显示帮助信息
show_help() {
    cat << EOF
Agent Team CLI - 多代理协作团队管理工具

用法:
    $0 <command> [options]

命令:
    start "需求描述"    启动新的 Agent Team 项目
    status [项目ID]     查看项目状态
    list               列出所有项目
    resume [项目ID]     恢复暂停的项目
    pause [项目ID]      暂停项目
    review [项目ID]     查看项目评审报告
    logs [项目ID]       查看通信日志
    help               显示此帮助信息

选项:
    --mode=MODE        协作模式: serial(串行)|parallel(并行)|agile(敏捷)
    --roles=ROLES      指定代理: pm,architect,designer,analyst,writer
    --project=NAME     指定项目名称

示例:
    $0 start "开发一个智能客服系统"
    $0 start --mode=parallel "分析竞品功能"
    $0 start --roles=pm,designer "设计一个登录页面"
    $0 status
    $0 status exam-scoring-20260301
    $0 list
    $0 resume exam-scoring-20260301

EOF
}

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# 生成项目ID
generate_project_id() {
    local name="$1"
    local date_str=$(date +%Y%m%d)
    # 将名称转换为小写，替换空格为连字符
    local sanitized=$(echo "$name" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-' | head -c 30)
    echo "${sanitized}-${date_str}"
}

# 初始化项目目录
init_project() {
    local project_id="$1"
    local project_dir="$PROJECTS_DIR/$project_id"

    print_info "初始化项目目录: $project_dir"

    mkdir -p "$project_dir"
    mkdir -p "$project_dir/logs"
    mkdir -p "$project_dir/07-references"

    # 复制状态模板；公开仓缺少本地模板时使用内置最小模板，避免绝对路径导致 clone 后不可用。
    if [ -f "$TEMPLATES_DIR/project-status-template.json" ]; then
        cp "$TEMPLATES_DIR/project-status-template.json" "$project_dir/project-status.json"
    else
        cat > "$project_dir/project-status.json" << EOF
{
  "project_id": "$project_id",
  "project_name": "$project_id",
  "mode": "serial",
  "description": "",
  "status": "created",
  "agents": {},
  "phases": [],
  "deliverables": {
    "completed": [],
    "in_progress": [],
    "pending": []
  },
  "blockers": [],
  "created_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "updated_at": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF
    fi

    # 初始化通信日志
    touch "$project_dir/logs/communication.jsonl"

    print_success "项目目录初始化完成"
}

# 更新项目状态
update_project_status() {
    local project_id="$1"
    local field="$2"
    local value="$3"
    local project_dir="$PROJECTS_DIR/$project_id"
    local status_file="$project_dir/project-status.json"

    if [ -f "$status_file" ]; then
        # 使用临时文件更新JSON
        python3 << EOF
import json
import sys

try:
    with open('$status_file', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 更新字段
    keys = '$field'.split('.')
    current = data
    for key in keys[:-1]:
        if key not in current:
            current[key] = {}
        current = current[key]
    current[keys[-1]] = '$value'

    # 更新时间戳
    from datetime import datetime
    data['updated_at'] = datetime.now().isoformat() + 'Z'

    with open('$status_file', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print('Status updated successfully')
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
EOF
    fi
}

# 启动新项目
cmd_start() {
    local requirement=""
    local mode="serial"
    local roles=""
    local project_name=""

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --mode=*)
                mode="${1#*=}"
                shift
                ;;
            --roles=*)
                roles="${1#*=}"
                shift
                ;;
            --project=*)
                project_name="${1#*=}"
                shift
                ;;
            -*)
                print_error "未知选项: $1"
                exit 1
                ;;
            *)
                requirement="$1"
                shift
                ;;
        esac
    done

    if [ -z "$requirement" ]; then
        print_error "请提供需求描述"
        echo "用法: $0 start \"需求描述\""
        exit 1
    fi

    # 生成项目名称
    if [ -z "$project_name" ]; then
        project_name=$(echo "$requirement" | head -c 30)
    fi

    local project_id=$(generate_project_id "$project_name")
    local project_dir="$PROJECTS_DIR/$project_id"

    print_info "启动 Agent Team 项目"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📋 任务信息:"
    echo "   需求: $requirement"
    echo "   模式: $mode"
    echo "   代理: ${roles:-全部}"
    echo "   项目: $project_id"
    echo ""

    # 检查项目是否已存在
    if [ -d "$project_dir" ]; then
        print_warning "项目已存在: $project_id"
        read -p "是否覆盖? (y/N): " confirm
        if [[ ! $confirm =~ ^[Yy]$ ]]; then
            print_info "取消启动"
            exit 0
        fi
        rm -rf "$project_dir"
    fi

    # 初始化项目
    init_project "$project_id"

    # 更新状态文件
    update_project_status "$project_id" "project_id" "$project_id"
    update_project_status "$project_id" "project_name" "$project_name"
    update_project_status "$project_id" "mode" "$mode"
    update_project_status "$project_id" "description" "$requirement"
    update_project_status "$project_id" "status" "in_progress"

    print_success "项目初始化完成"
    echo ""
    echo "🎯 项目目录: $project_dir"
    echo "📊 状态文件: $project_dir/project-status.json"
    echo ""
    echo "接下来请使用 Skill 调用 agent-team:"
    echo "   /agent-team --project=$project_id --mode=$mode \"$requirement\""
}

# 查看项目状态
cmd_status() {
    local project_id="$1"

    if [ -z "$project_id" ]; then
        # 列出所有项目
        print_info "项目列表"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        if [ ! -d "$PROJECTS_DIR" ] || [ -z "$(ls -A "$PROJECTS_DIR" 2>/dev/null)" ]; then
            print_warning "暂无项目"
            exit 0
        fi

        for dir in "$PROJECTS_DIR"/*; do
            if [ -d "$dir" ]; then
                local pid=$(basename "$dir")
                local status_file="$dir/project-status.json"

                if [ -f "$status_file" ]; then
                    local status=$(python3 -c "import json; print(json.load(open('$status_file')).get('status', 'unknown'))" 2>/dev/null || echo "unknown")
                    local name=$(python3 -c "import json; print(json.load(open('$status_file')).get('project_name', 'Unknown'))" 2>/dev/null || echo "Unknown")

                    # 状态颜色
                    local status_color=""
                    case $status in
                        completed) status_color="$GREEN" ;;
                        in_progress) status_color="$BLUE" ;;
                        blocked) status_color="$RED" ;;
                        paused) status_color="$YELLOW" ;;
                        *) status_color="$NC" ;;
                    esac

                    printf "  %-30s %-20s %b%s%b\n" "$pid" "[$name]" "$status_color" "$status" "$NC"
                fi
            fi
        done
        echo ""
        echo "使用 '$0 status <项目ID>' 查看详细状态"
    else
        # 查看特定项目状态
        local project_dir="$PROJECTS_DIR/$project_id"
        local status_file="$project_dir/project-status.json"

        if [ ! -f "$status_file" ]; then
            print_error "项目不存在: $project_id"
            exit 1
        fi

        print_info "项目状态: $project_id"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        python3 << EOF
import json
import sys

try:
    with open('$status_file', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 项目信息
    print(f"📋 项目信息")
    print(f"   名称: {data.get('project_name', 'N/A')}")
    print(f"   ID: {data.get('project_id', 'N/A')}")
    print(f"   状态: {data.get('status', 'N/A')}")
    print(f"   模式: {data.get('mode', 'N/A')}")
    print(f"")

    # 代理状态
    print(f"👥 代理状态")
    agents = data.get('agents', {})
    for agent_name, agent_info in agents.items():
        status = agent_info.get('status', 'unknown')
        progress = agent_info.get('progress', 0)
        current_task = agent_info.get('current_task', 'N/A')

        # 状态图标
        icon = "⏳"
        if status == 'completed':
            icon = "✅"
        elif status == 'in_progress':
            icon = "🔄"
        elif status == 'blocked':
            icon = "🚫"
        elif status == 'skipped':
            icon = "⏭️"

        print(f"   {icon} {agent_name:20} {status:15} {progress:3}% - {current_task}")

    print(f"")

    # 阶段状态
    print(f"📊 阶段状态")
    phases = data.get('phases', [])
    for phase in phases:
        phase_name = phase.get('phase_name', 'N/A')
        phase_status = phase.get('status', 'unknown')

        icon = "⏳"
        if phase_status == 'completed':
            icon = "✅"
        elif phase_status == 'in_progress':
            icon = "🔄"

        print(f"   {icon} {phase_name}: {phase_status}")

    print(f"")

    # 产出物
    print(f"📁 产出物")
    deliverables = data.get('deliverables', {})
    completed = deliverables.get('completed', [])
    in_progress = deliverables.get('in_progress', [])
    pending = deliverables.get('pending', [])

    for d in completed:
        print(f"   ✅ {d.get('name', 'N/A')}: {d.get('path', 'N/A')}")
    for d in in_progress:
        print(f"   🔄 {d.get('name', 'N/A')}: {d.get('path', 'N/A')}")
    for d in pending:
        print(f"   ⏳ {d.get('name', 'N/A')}: {d.get('path', 'N/A')}")

    # 阻塞项
    blockers = data.get('blockers', [])
    if blockers:
        print(f"")
        print(f"🚫 阻塞项")
        for blocker in blockers:
            print(f"   - {blocker}")

except Exception as e:
    print(f'Error reading status file: {e}', file=sys.stderr)
    sys.exit(1)
EOF
    fi
}

# 列出所有项目
cmd_list() {
    cmd_status
}

# 恢复项目
cmd_resume() {
    local project_id="$1"

    if [ -z "$project_id" ]; then
        print_error "请指定项目ID"
        echo "用法: $0 resume <项目ID>"
        exit 1
    fi

    local project_dir="$PROJECTS_DIR/$project_id"
    local status_file="$project_dir/project-status.json"

    if [ ! -f "$status_file" ]; then
        print_error "项目不存在: $project_id"
        exit 1
    fi

    update_project_status "$project_id" "status" "in_progress"
    print_success "项目已恢复: $project_id"

    # 显示当前状态
    cmd_status "$project_id"
}

# 暂停项目
cmd_pause() {
    local project_id="$1"

    if [ -z "$project_id" ]; then
        print_error "请指定项目ID"
        echo "用法: $0 pause <项目ID>"
        exit 1
    fi

    local project_dir="$PROJECTS_DIR/$project_id"
    local status_file="$project_dir/project-status.json"

    if [ ! -f "$status_file" ]; then
        print_error "项目不存在: $project_id"
        exit 1
    fi

    update_project_status "$project_id" "status" "paused"
    print_success "项目已暂停: $project_id"
}

# 查看评审报告
cmd_review() {
    local project_id="$1"

    if [ -z "$project_id" ]; then
        # 尝试找到最新的项目
        if [ -d "$PROJECTS_DIR" ]; then
            project_id=$(ls -t "$PROJECTS_DIR" | head -1)
        fi
    fi

    if [ -z "$project_id" ]; then
        print_error "请指定项目ID"
        exit 1
    fi

    local project_dir="$PROJECTS_DIR/$project_id"
    local review_file="$project_dir/08-review-report-v1.md"

    if [ ! -f "$review_file" ]; then
        print_warning "评审报告不存在: $review_file"
        exit 0
    fi

    print_info "评审报告: $project_id"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    cat "$review_file"
}

# 查看日志
cmd_logs() {
    local project_id="$1"
    local lines="${2:-50}"

    if [ -z "$project_id" ]; then
        print_error "请指定项目ID"
        echo "用法: $0 logs <项目ID> [行数]"
        exit 1
    fi

    local project_dir="$PROJECTS_DIR/$project_id"
    local log_file="$project_dir/logs/communication.jsonl"

    if [ ! -f "$log_file" ]; then
        print_error "日志文件不存在: $log_file"
        exit 1
    fi

    print_info "通信日志: $project_id (最近 $lines 条)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    tail -n "$lines" "$log_file" | while read -r line; do
        echo "$line" | python3 -m json.tool 2>/dev/null || echo "$line"
        echo "---"
    done
}

# 主函数
main() {
    local command="${1:-help}"
    shift || true

    case $command in
        start)
            cmd_start "$@"
            ;;
        status)
            cmd_status "$@"
            ;;
        list|ls)
            cmd_list
            ;;
        resume)
            cmd_resume "$@"
            ;;
        pause)
            cmd_pause "$@"
            ;;
        review)
            cmd_review "$@"
            ;;
        logs|log)
            cmd_logs "$@"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
