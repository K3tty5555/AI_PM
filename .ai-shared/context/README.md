# AI_PM 共享上下文

这里存放比单次会话更稳定、但又不一定适合写进长期 memory 的项目级上下文。

建议文件：

| 文件 | 用途 |
|------|------|
| `project-current-state.md` | 当前项目阶段、最近完成事项、当前风险 |
| `product-decisions.md` | 已确认产品决策和命名口径 |
| `terminology.md` | 跨 PRD / 原型统一术语 |
| `open-questions.md` | 尚未确认的问题 |

写入原则：

- 只写稳定事实，不写推测。
- 每条尽量带日期和来源。
- 与用户最新指令或 PRD 冲突时，以用户最新指令和 PRD 为准。
