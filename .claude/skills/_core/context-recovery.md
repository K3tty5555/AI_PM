# AI_PM 上下文恢复协议

> 会话中断后的恢复步骤

## 快速恢复流程

### 步骤1: 确定当前项目

```bash
# 查看当前项目记录
cat output/.current-project

# 或使用状态检查脚本
.claude/skills/ai-pm/status-check.sh
```

### 步骤2: 读取项目状态

```bash
# 读取项目状态文件
cat output/projects/{项目名}/project-status.json
```

### 步骤3: 检查已完成阶段

关键文件检查清单：
- `01-requirement-draft.md`    → Phase 1 完成
- `02-analysis-report.md`      → Phase 2 完成
- `03-competitor-report.md`    → Phase 3 完成
- `04-user-stories.md`         → Phase 4 完成
- `05-prd/05-PRD-v1.0.md`      → Phase 5 完成
- `09-analytics-requirement.md` → Phase 6 完成
- `06-prototype/index.html`    → Phase 7 完成
- `08-review-report-v1.md`     → Phase 8 完成

### 现场调研模式检查清单

- `11-field-research/00-prep-notes.md`      → 准备阶段完成
- `11-field-research/01-interview-guide.md` → 访谈提纲完成
- `11-field-research/02-interview-notes.md` → 访谈记录完成
- `11-field-research/03-prd-draft-v1.md`    → PRD草案v1完成
- `11-field-research/05-iteration-log.md`   → 有迭代记录

### 步骤4: 从断点继续

检测到项目进度后，询问用户：
```
📁 检测到项目 {项目名} 的进度：
- 已完成：Phase 1-{最后完成阶段}
- 下一阶段：Phase {下一阶段}

💬 请选择：
1. 从 Phase {下一阶段} 继续
2. 重新执行 Phase {某阶段}
3. 查看已完成内容
```

## 上下文爆炸后的恢复

### 症状判断
- Token 消耗过快
- 响应时间变长
- 重复询问已确认的信息

### 恢复方案

**方案A: 会话重置（推荐）**
1. 记录当前任务状态到 todo.md
2. git commit 当前进度
3. 开新会话
4. 读取 project-status.json 恢复上下文
5. 从断点继续

**方案B: 分阶段执行**
不再执行完整流程，改为单阶段执行：
- `/ai-pm analyze`    # 仅执行需求分析
- `/ai-pm prd`        # 仅生成 PRD
- `/ai-pm prototype`  # 仅生成原型

**方案C: 精简模式**
跳过非关键阶段：
- 跳过竞品研究（如果已了解竞品）
- 跳过用户故事（如果时间紧迫）
- 跳过需求评审（如果内部评审）

## 常用恢复命令

```bash
# 快速查看项目列表
ls -la output/projects/

# 查看最新修改的项目
ls -lt output/projects/ | head -5

# 检查特定项目的进度
cat output/projects/{项目名}/project-status.json

# 查看最近的 PRD
ls -lt output/projects/*/05-prd/*.md 2>/dev/null | head -5
```

---

**关联文件**：
- [file-index.md](./file-index.md) - 文件位置索引
