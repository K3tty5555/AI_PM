# 上下文优化协议 (激进版)

> 针对 Token 限制 262,144 的激进优化策略

## Token 预警系统

```
[绿色] < 150k - 正常，完整加载
[黄色] 150k-180k - 预警，按需加载
[橙色] 180k-200k - 限制，摘要模式
[红色] > 200k - 紧急，建议新开会话
```

## 1. 文件加载策略

### 核心文件 (始终加载, ~15k tokens)
- `SKILL.md` - 精简入口
- `context-budget.md` - Token 预算
- `file-index.md` - 文件索引

### 按需加载 (LAZY)
```markdown
<!-- 在 SKILL.md 中使用标记 -->
<!-- LAZY: phase-2-3.md -->
<!-- LAZY: style-management.md -->
```

### 引用代替内联
```markdown
❌ 错误: 直接粘贴大文件内容
✅ 正确: 引用文件路径
   "详见 [phase-2-3.md](.claude/skills/ai-pm/phase-2-3.md)"
```

## 2. 大文件处理规则

| 原文件 | 拆分策略 |
|-------|---------|
| user-interaction.md (550行) | → core(80) + style(120) + config(100) |
| web-analysis.md (431行) | → commands(100) + workflow(80) + examples(120) |
| phase-workflows.md (313行) | → phase-0-1(80) + phase-2-3(80) + phase-4-5(80) + phase-6-9(80) |

## 3. 对话历史压缩

### 自动压缩触发
- 超过 10 轮对话
- Token 超过 180k

### 压缩格式
```markdown
## 对话摘要 [Round 1-5]
- 用户: 需求分析
- AI: 完成用户画像、痛点分析
- 关键决策: 目标用户为 B 端企业
- 待跟进: 竞品清单需确认
```

## 4. 项目文件策略

### PRD 处理
```markdown
当前 PRD: projects/xxx/05-prd/README.md (仅加载摘要)
- 状态: Phase 3 进行中
- 关键决策: [决策1, 决策2]
- 当前焦点: 功能清单细化
```

### 原型文件
- 不加载 HTML/CSS/JS 代码
- 只保留文件路径和状态

## 5. 紧急逃生方案

当 Token > 200k 时：

1. **立即保存状态**
   ```bash
   # 创建 checkpoint
   .claude/skills/ai-pm/context-save.sh
   ```

2. **提议新开会话**
   ```
   "上下文接近上限，建议开启新会话继续。
   已保存状态到 .checkpoint.md，新会话自动恢复。"
   ```

3. **压缩模式**
   - 只响应用户问题
   - 不主动加载任何技能文件
   - 使用最精简的回复格式
