export const PHASE_ORDER = [
  "requirement", "analysis", "research", "stories", "prd",
  "analytics", "prototype", "review", "retrospective",
] as const

export type Phase = typeof PHASE_ORDER[number]

export const REQUIRED_PHASES = ["requirement", "prd"] as const

export const PHASE_LABELS: Record<string, string> = {
  requirement: "需求收集",
  analysis: "需求分析",
  research: "竞品研究",
  stories: "用户故事",
  prd: "PRD 撰写",
  analytics: "埋点设计",
  prototype: "原型设计",
  review: "需求评审",
  "review-modify": "评审修订",
  retrospective: "项目复盘",
}

export const TOOL_LABELS: Record<string, string> = {
  priority: "优先级评估",
  weekly: "工作周报",
  data: "数据洞察",
  interview: "调研访谈",
  knowledge: "知识库",
  persona: "产品分身",
  "design-spec": "设计规范",
}

export interface PhaseMeta {
  nextLabel: string
  nextDescription: string
  backLabel: string
}

export const PHASE_META: Record<string, PhaseMeta> = {
  requirement: {
    nextLabel: "进入需求分析",
    nextDescription: "深挖用户痛点和核心价值",
    backLabel: "← 返回",
  },
  research: {
    nextLabel: "进入用户故事",
    nextDescription: "拆解功能场景和验收标准",
    backLabel: "← 返回需求分析",
  },
  analysis: {
    nextLabel: "进入竞品研究",
    nextDescription: "分析竞品，找到差异化机会",
    backLabel: "← 返回修改需求",
  },
  stories: {
    nextLabel: "进入 PRD",
    nextDescription: "撰写完整产品需求文档",
    backLabel: "← 返回分析",
  },
  prd: {
    nextLabel: "进入埋点设计",
    nextDescription: "基于 PRD 设计指标体系和埋点方案",
    backLabel: "← 返回故事",
  },
  analytics: {
    nextLabel: "进入原型设计",
    nextDescription: "基于 PRD 生成可交互原型",
    backLabel: "← 返回 PRD",
  },
  prototype: {
    nextLabel: "进入需求评审",
    nextDescription: "六角色评审，发现遗漏和风险",
    backLabel: "← 返回埋点设计",
  },
  review: {
    nextLabel: "完成项目",
    nextDescription: "归档所有产出，项目结束",
    backLabel: "← 返回原型",
  },
  retrospective: {
    nextLabel: "完成复盘",
    nextDescription: "复盘完成，经验已记录",
    backLabel: "← 返回需求评审",
  },
}
