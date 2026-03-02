# AI_PM 技能依赖关系

## 调用关系图

```
                    ┌─────────────────┐
                    │    用户输入      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   ai-pm (主控)   │
                    │   SKILL.md      │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│ ai-pm-analyze │   │ ai-pm-research│   │ ai-pm-story   │
│ 需求分析       │   │ 竞品研究       │   │ 用户故事       │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  ai-pm-prd      │
                    │  PRD生成        │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
     │ai-pm-analytics│ │ai-pm-ui- │ │ai-pm-prototype│
     │数据分析与埋点  │ │  spec    │ │  原型生成     │
     └───────────────┘ │ UI规范   │ └─────────────┘
                       └──────────┘
                             │
                    ┌────────▼────────┐
                    │ ai-pm-review    │
                    │ 需求评审        │
                    └─────────────────┘
```

## 依赖关系表

| 技能 | 依赖技能 | 被谁依赖 | 说明 |
|------|---------|---------|------|
| ai-pm | 所有子技能 | - | 主控技能，协调调用 |
| ai-pm-analyze | - | ai-pm | 独立执行需求分析 |
| ai-pm-research | - | ai-pm | 独立执行竞品研究 |
| ai-pm-story | ai-pm-analyze | ai-pm | 依赖分析结果 |
| ai-pm-prd | analyze/research/story | ai-pm | 整合前三阶段输出 |
| ai-pm-analytics | ai-pm-prd | - | 读取PRD进行数据设计 |
| ai-pm-ui-spec | - | ai-pm, prototype | UI规范管理 |
| ai-pm-prototype | ai-pm-prd, ui-spec | - | 需要PRD和规范 |
| ai-pm-review | ai-pm-prd, prototype | - | 评审PRD和原型 |

## 数据流向

### Phase 0-4 数据流
```
用户输入 → 01-requirement-draft.md → 02-analysis-report.md
                                      ↓
                              03-competitor-report.md
                                      ↓
                              04-user-stories.md
```

### Phase 5-8 数据流
```
02/03/04 → 05-prd/05-PRD-v1.0.md → 09-analytics-requirement.md
                                          ↓
                              06-prototype/index.html
```

### Phase 9 数据流
```
05-PRD + 06-prototype → 08-review-report-v1.md → (修改) → 05-PRD-v1.1
```

## 关键配置传递

### 写作风格配置
```
templates/prd-styles/{风格}/style-config.json
              ↓
         ai-pm-prd (读取)
              ↓
    05-prd/05-PRD-v1.0.md (应用)
```

### UI 规范配置
```
templates/ui-specs/{规范}/design-tokens.json
              ↓
         ai-pm-ui-spec (管理)
              ↓
    项目配置 .ai-pm-config.json (保存选择)
              ↓
         ai-pm-prototype (应用)
              ↓
    06-prototype/style.css (生成)
```

## 文件修改注意事项

### 修改 SKILL.md 时
- 检查是否影响子技能调用
- 确认文件路径引用正确
- 更新 [file-index.md](./file-index.md)

### 修改子技能时
- 检查 ai-pm 是否正确引用
- 确认输出格式兼容
- 测试与上下游技能的集成

---

**关联文件**：
- [file-index.md](./file-index.md) - 文件位置索引
- [context-recovery.md](./context-recovery.md) - 上下文恢复协议
