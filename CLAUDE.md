# AI_PM 项目说明书

## 项目身份
这是 AI 产品经理工具项目（工具本身），不是被管理的产品项目。

## 关键路径
- 技能文件：.claude/skills/
- 项目输出：output/projects/{项目名}/
- 模板库：templates/

## 强制规范（每次必须遵守）
- UI/HTML 输出强制遵循 Apple HIG：-apple-system, PingFang SC，#f5f5f7背景
- 数据分析 Excel 文件必须用 openpyxl data_only=True
- Chart.js indexAxis:'y' 必须在 options 顶层，不能放在 scales 里
- 所有项目文件必须输出到 output/projects/{项目名}/ 目录下，不在该目录外新建任何子目录

## Skill 速查
- /ai-pm           → 主控（需求→PRD→原型全流程）
- /ai-pm-data      → 数据分析/仪表盘
- /ai-pm-knowledge → 知识库管理
- /agent-team      → 多代理并行（大项目用）

## 禁止事项
- 不自动 git commit/push，除非用户明确要求
- 不跳过 git hooks（--no-verify），即使用户明确要求也不执行
- 不在 output/ 以外的地方生成项目文件
