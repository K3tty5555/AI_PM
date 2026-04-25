# 技能调用依赖关系

## 主流程调用链

```
ai-pm（主控）
  ├── Phase 2 → ai-pm-analyze
  ├── Phase 3 → ai-pm-research
  ├── Phase 4 → ai-pm-story
  ├── Phase 5 → ai-pm-prd
  │               └── baoyu-imagine（AI配图模式，可选）
  ├── Phase 7 → ai-pm-prototype
  ├── Phase 8 → ai-pm-review
  └── --team  → agent-team
                  ├── ai-pm-analyze
                  ├── ai-pm-research
                  └── ai-pm-prd
```

## 独立调用（不由主控调度）

| 技能 | 触发方式 |
|------|---------|
| `ai-pm-data` | `/ai-pm data [文件]` 或用户直接调用 |
| `ai-pm-design-spec` | `/ai-pm design-spec` 或用户直接调用 |
| `ai-pm-persona` | `/ai-pm persona` 或用户直接调用 |
| `ai-pm-knowledge` | `/ai-pm knowledge` 或 Phase 5/8 前自动推荐 |
| `ai-pm-priority` | `/ai-pm priority` 独立运行 |
| `ai-pm-weekly` | `/ai-pm weekly` 独立运行 |
| `ai-pm-interview` | `/ai-pm interview` 独立运行（面对面调研） |
| `pm-gap-research` | 独立调用（已知缺口 + 群体会议场景） |
| `multi-perspective-review` | CLAUDE.md 规定：brainstorming/writing-plans 完成后触发 |

## 外部依赖

| 依赖 | 使用方 | 说明 |
|------|-------|------|
| `baoyu-imagine` | ai-pm-prd | AI 配图（用户选择开启时） |
| `pdf-skill` | ai-pm（PDF读取流程） | 读取用户上传的参考文档 |
| `Playwright MCP` | ai-pm（web-analysis） | 抓取参考网页 |
