#!/bin/bash
# 上下文保存脚本 - Token 紧急时保存会话状态

PROJECT_DIR="output/projects"
CHECKPOINT_FILE=".checkpoint.md"

# 获取当前项目
get_current_project() {
    if [ -f ".current-project" ]; then
        cat .current-project
    else
        ls -t output/projects 2>/dev/null | head -1
    fi
}

# 保存会话状态
save_checkpoint() {
    local project=$1
    local project_path="${PROJECT_DIR}/${project}"

    if [ -z "$project" ]; then
        echo "❌ 未找到当前项目"
        exit 1
    fi

    cat > "${project_path}/${CHECKPOINT_FILE}" << EOF
# 会话检查点

**生成时间**: $(date '+%Y-%m-%d %H:%M:%S')

## 项目信息
- **项目名**: ${project}
- **项目路径**: ${project_path}

## 当前状态
$(ls -1 ${project_path}/*.md 2>/dev/null | xargs -I {} basename {} | sed 's/^/- /')

## 文件摘要
EOF

    # 添加各文件摘要
    for file in ${project_path}/*.md; do
        if [ -f "$file" ]; then
            echo "" >> "${project_path}/${CHECKPOINT_FILE}"
            echo "### $(basename $file)" >> "${project_path}/${CHECKPOINT_FILE}"
            echo '```' >> "${project_path}/${CHECKPOINT_FILE}"
            head -20 "$file" >> "${project_path}/${CHECKPOINT_FILE}"
            echo '```' >> "${project_path}/${CHECKPOINT_FILE}"
        fi
    done

    echo ""
    echo "## 待办/待确认事项" >> "${project_path}/${CHECKPOINT_FILE}"
    echo "- [ ] 待补充" >> "${project_path}/${CHECKPOINT_FILE}"

    echo "✅ 检查点已保存: ${project_path}/${CHECKPOINT_FILE}"
}

# 恢复会话
load_checkpoint() {
    local project=$1
    local project_path="${PROJECT_DIR}/${project}"

    if [ -f "${project_path}/${CHECKPOINT_FILE}" ]; then
        echo "📋 会话状态摘要:"
        cat "${project_path}/${CHECKPOINT_FILE}"
    else
        echo "❌ 未找到检查点文件"
    fi
}

# 主逻辑
case "${1:-save}" in
    save)
        project=$(get_current_project)
        save_checkpoint "$project"
        ;;
    load)
        project=$(get_current_project)
        load_checkpoint "$project"
        ;;
    *)
        echo "用法: $0 [save|load]"
        exit 1
        ;;
esac
