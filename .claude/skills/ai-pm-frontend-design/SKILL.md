---
name: ai-pm-frontend-design
description: >-
  AI_PM 本地 HTML/UI 设计内核。用于 AI_PM 生成可评审 HTML 原型、数据仪表盘、独立展示页和
  UI/HTML 产出物时提供稳定的视觉判断、交互状态、信息层级、响应式与质量自检规则。
  当 ai-pm-prototype、ai-pm-data dashboard、HTML 原型、数据看板、可交互页面、页面视觉打磨、
  原型审计或 clone 用户未安装外部 impeccable 插件时，必须使用此技能作为项目自带 fallback。
---

# AI_PM Frontend Design

这是 AI_PM 自带的原型设计内核，用于让 clone 用户在没有外部 `impeccable` 或 `ui-ux-pro-max` 插件时，仍能稳定生成高保真、可交互、业务贴合的 HTML 原型和数据仪表盘。

本技能不复制外部插件文本、模板或素材。若用户本机存在 `impeccable:frontend-design`，它只能作为增强规则追加；AI_PM 的项目流程、用户选择的设计规范、PRD 事实和本技能质量门控优先。

## Core Workflow

1. 先判定产物类型：业务原型、数据仪表盘、独立报告页、客户端页面、注入式页面。
2. 生成内部 `Design Brief`：从 PRD / 项目记忆 / 参考资料提取用户、任务、场景、气质、反向偏好；缺关键项时只问最少问题。
3. 按视觉来源优先级决策：公司/团队规范 > 视觉锚点包 > 代码仓设计指纹 > 用户明确偏好 > Design Brief > 情境化设计判断。
4. 生成原型蓝图：页面清单、主流程、信息层级、状态清单、交互清单、视觉方向、硬约束。
5. 输出 HTML/CSS/JS：页面必须可操作，状态必须可见，假数据必须贴近业务。
6. 执行 `critique → audit → polish` 三段式自检；不通过时先修正，不把问题留给用户。

## Must Read References

- `references/design-brief.md`：生成任何 UI/HTML 前读取，用于建立目标用户、任务、场景和视觉方向。
- `references/prototype-design-kernel.md`：生成 HTML 原型和 UI 页面时读取。
- `references/dashboard-design.md`：生成数据仪表盘、指标看板、分析展示页时读取。
- `references/visual-system.md`：确定布局、间距、字体、色彩、动效和反 AI 味规则时读取。
- `references/interaction-hardening.md`：补齐交互状态、响应式、表单、键盘、触控和边界情况时读取。
- `references/audit-polish.md`：落盘前做批判、审计、打磨三段式自检时读取。
- `references/quality-gate.md`：落盘前或审计原型时读取。

## Non-Negotiables

- 不退回通用 SaaS 模板、灰白卡片堆叠、蓝按钮糊弄或无业务含义的炫技视觉。
- 不依赖 `ui-ux-pro-max`；它是历史外部插件拷贝，不再作为事实源或生成主脑。
- 不把 AI_PM 客户端 `docs/design-system.md` 强行套到业务原型上，除非目标产物就是 AI_PM 客户端页面。
- 不把项目根 `.impeccable.md` 的品牌视觉自动套给另一个产品；只能提取通用设计质量要求，品牌/配色必须服从目标产品上下文。
- 不输出只有静态截图感的 HTML。核心按钮、筛选、导航、表单、AI 状态或主流程节点必须有真实前端状态变化。
- 不在原型中使用“测试数据 / 示例内容 / 张三 / Lorem ipsum”等占位内容。

## External Enhancements

如系统提示中同时出现 `impeccable:frontend-design`：

- 读取其中的上下文收集、审查和视觉打磨建议。
- 与本技能冲突时，以 AI_PM 用户选择、PRD 事实、公司规范、本技能质量门控为准。
- 不要求用户安装外部插件；缺失时按本技能完整执行。
