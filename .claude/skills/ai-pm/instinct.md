# Instinct 自学习系统 — 技能侧集成

## 命令路由

| 命令 | 说明 |
|------|------|
| `/ai-pm instinct list` | 查看所有直觉及置信度 |
| `/ai-pm instinct review` | 逐条确认或否定直觉 |
| `/ai-pm instinct import` | 从 persona 风格档案导入为高置信度直觉 |
| `/ai-pm instinct reset` | 清空所有直觉（需二次确认） |

## 存储位置

`~/.config/ai-pm/instincts/`（跟用户绑定，不跟项目目录）

```
~/.config/ai-pm/instincts/
├── writing/          # 写作风格直觉
│   └── INST-W001.md
├── workflow/         # 流程偏好直觉
│   └── INST-F001.md
├── archived/         # 衰减归档
└── instincts-index.json
```

## Phase 5 前注入（PRD 生成前）

在 PRD 生成 prompt 构建时：

1. 读取 `~/.config/ai-pm/instincts/instincts-index.json`
2. 筛选 `type: "writing"` 且 `confidence >= 0.5` 的直觉
3. 将直觉描述拼接为额外上下文，注入 system prompt：

```
## 用户写作习惯（自动学习）
以下是从历史项目中观察到的用户写作偏好，请在生成 PRD 时参考：
{confidence >= 0.7 的直觉} → 标记为「必须遵循」
{confidence 0.5-0.6 的直觉} → 标记为「建议参考」
```

## Phase 0 前注入（项目启动时）

读取 `type: "workflow"` 且 `confidence >= 0.5` 的流程偏好直觉，用于：
- 预填默认选项（如"跳过竞品研究"）
- 预设导出格式偏好
- 调整阶段执行顺序建议

## 项目完成时提取

在 Phase 9（复盘）或项目归档时自动触发：

### 提取步骤

1. **扫描项目产物**：
   - `_status.json` → 跳过了哪些阶段？（流程偏好）
   - `05-prd/05-PRD-v1.0.md` → 文档结构、章节命名（写作风格）
   - 导出记录 → 选择了什么格式？（导出偏好）
   - 评审修改记录 → 用户主动修改了哪些？（质量标准）

2. **与现有直觉比对**：
   - 已有直觉被再次观察到 → `observations += 1`，更新 `last_seen`，按规则提升 confidence
   - 新模式首次出现 → 创建新直觉，`confidence: 0.3`

3. **衰减检查**：
   - 遍历所有直觉，检查 `last_seen`
   - 超过 90 天且期间有新项目完成但未观察到 → confidence 降一档
   - 降到 0.3 以下 → 移入 `archived/`

### 置信度规则

```
单次观察         → 0.3（记录不应用）
2 个项目重复     → 0.5（弱应用）
3+ 个项目重复    → 0.7（强应用）
用户 confirm     → 0.9（锁定）
用户 delete      → 删除
超 90 天未见     → 降一档（0.7→0.5→0.3→归档）
```

## `/ai-pm instinct list` 输出格式

```markdown
## 我的习惯直觉

### 写作风格（3 条）
| ID | 描述 | 置信度 | 观察次数 | 状态 |
|----|------|--------|---------|------|
| INST-W001 | PRD 不写背景，直接上功能 | 0.7 | 3 | 🟢 强应用 |
| INST-W002 | 用表格描述字段 | 0.5 | 2 | 🟡 弱应用 |
| INST-W003 | 结论放前面 | 0.3 | 1 | ⚪ 仅记录 |

### 流程偏好（2 条）
| ID | 描述 | 置信度 | 观察次数 | 状态 |
|----|------|--------|---------|------|
| INST-F001 | 总是跳过竞品研究 | 0.7 | 4 | 🟢 强应用 |
| INST-F002 | 偏好飞书格式导出 | 0.5 | 2 | 🟡 弱应用 |
```

## `/ai-pm instinct review` 流程

逐条展示直觉，用户选择：
- **确认** → confidence 提升到 0.9
- **否定** → 删除该直觉
- **跳过** → 保持不变
