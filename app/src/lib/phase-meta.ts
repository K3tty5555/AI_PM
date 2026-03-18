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
    nextLabel: "进入用户故事",
    nextDescription: "拆解功能场景和验收标准",
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
}
