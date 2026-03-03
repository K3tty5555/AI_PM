# 上下文优化策略总结 (激进版)

> 针对 Token 限制 262,144 的全面优化方案
> 实际报错: 请求 263,302 tokens > 限制 262,144

## 核心问题分析

- **限制**: 262,144 tokens
- **超支**: ~1,158 tokens (0.4%)
- **触发场景**: 多轮对话后技能文件+项目文件+历史累积

## 已实施的优化

### 1. Token 预算管理 (context-budget.md)

```
系统提示: 10k
技能核心: 30k
记忆文件: 20k
项目上下文: 80k
对话历史: 50k
缓冲区: 10k
-----------------
总计: 200k (安全线)
```

**预警等级**:
- 🟢 <150k: 正常
- 🟡 150k-180k: 预警，按需加载
- 🟠 180k-200k: 限制，摘要模式
- 🔴 >200k: 紧急，新开会话

### 2. 文件拆分策略

| 原文件 | 大小 | 拆分方案 |
|-------|------|---------|
| user-interaction.md | 550行 | → core(80) + style(120) + config(100) |
| web-analysis.md | 431行 | → commands(100) + workflow(80) |
| phase-workflows.md | 313行 | → phase-0-1 + phase-2-3 + phase-4-5 + phase-6-9 |

### 3. 精简版技能文件 (SKILL-minimal.md)

- 仅 50 行，包含核心命令
- Token 紧张时使用
- 完整文档引用外部文件

### 4. Checkpoint 机制 (context-save.sh)

```bash
# 保存会话状态
.claude/skills/ai-pm/context-save.sh save

# 生成 .checkpoint.md 包含:
# - 项目信息
# - 当前阶段
# - 文件摘要 (前20行)
# - 待办事项
```

### 5. 会话压缩协议 (session-compression.md)

**自动压缩触发**:
- 对话 >10 轮
- Token >180k

**压缩格式**:
```markdown
## 会话摘要 [R1-R5]
### 关键决策
- D1: 目标用户 = B端
### 已完成
- ✅ Phase 1-3
### 进行中
- 🔄 Phase 4
```

### 6. 引用代替内联规则

```markdown
❌ 错误:
   "PRD内容: [粘贴全文]"

✅ 正确:
   "PRD已生成: projects/xxx/05-prd/README.md"
   "包含: 修订日志、需求分析、功能清单..."
```

## 未来优化方向

### 短期 (已实现)
- [x] Token 预算分配
- [x] 精简版 SKILL
- [x] Checkpoint 机制
- [x] 会话压缩协议

### 中期 (待实施)
- [ ] 技能文件懒加载标记
- [ ] 对话历史自动压缩
- [ ] 项目文件按需读取

### 长期 (规划)
- [ ] 多会话协作协议
- [ ] 上下文健康度检测
- [ ] 智能文件预加载

## 使用建议

### 正常流程
1. 使用完整 SKILL.md (214行)
2. 按阶段加载子文件
3. 监控 Token 使用

### Token 紧张时
1. 自动切换到 SKILL-minimal.md
2. 使用文件引用代替内容
3. 执行上下文保存
4. 建议新开会话

### 新开会话恢复
```
用户: /ai-pm
AI: 检测到项目 xxx 有 checkpoint，是否恢复?
    [加载 .checkpoint.md 摘要]
```

## 关键文件清单

| 文件 | 作用 | 大小 |
|-----|------|------|
| context-budget.md | Token 预算 | ~3k |
| context-optimizer.md | 优化协议 | ~4k |
| session-compression.md | 压缩规则 | ~3k |
| context-save.sh | 保存脚本 | ~2k |
| SKILL-minimal.md | 精简入口 | ~1.5k |
