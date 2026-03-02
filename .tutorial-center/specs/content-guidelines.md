# AI_PM 教程中心 - 内容规范

## 1. 概述

本文档定义教程中心的所有内容标准，包括文案风格、技能描述格式、使用场景说明等。

## 2. 文案风格指南

### 2.1 语气与语调
- **友好专业**：像一位经验丰富的导师，而非冷漠的文档
- **简洁有力**：避免冗长，直击要点
- **鼓励性**：让用户感到"我也能做到"
- **一致性**：相同概念使用相同表述

### 2.2 用词规范

**推荐用词**
- "开始体验" 而非 "开始使用"
- "引导你" 而非 "帮助您"
- "产出" 而非 "生成"（强调结果）
- "技能" 而非 "功能"（AI_PM 特有术语）

**避免用词**
- ❌ "简单"、"容易"（暗示用户可能做不到）
- ❌ "只需要"（可能低估复杂度）
- ❌ 技术缩写（除非已解释）

## 3. 首页文案

### 3.1 Eyebrow（小标题）
```
AI_PM
```

### 3.2 Hero 标题
```
AI产品助手
```

### 3.3 描述文案
```
AI_PM 是一套专业的产品管理工具集。只需描述你的想法，AI 将引导你完成需求分析、竞品研究、PRD 编写、原型设计全流程。
```

## 4. 技能卡片规范

### 4.1 卡片结构
每个技能卡片必须包含：
1. **图标**：Emoji 或 SVG，28-32px
2. **名称**：2-4 个汉字，简洁有力
3. **命令**：完整的命令格式，带参数说明
4. **简短描述**：一句话说明核心功能
5. **使用场景**：2-3 个典型场景
6. **示例**：1 个完整的实际案例

### 4.2 技能描述模板

```yaml
名称: AI_PM 主控
命令: "/ai-pm"
图标: 🎯
简短描述: 完整产品流程，从需求到原型
使用场景:
  - 全新项目启动，需要全流程指导
  - 快速验证一个产品想法
  - 初学者体验 AI_PM 的最佳入口
示例:
  场景: 你想做一个记账小程序
  命令: /ai-pm "我想做一个记账小程序，帮助年轻人管理日常开支"
  结果: AI 会引导你完成需求澄清，然后自动分析、研究、生成 PRD 和原型
```

### 4.3 所有技能详细定义

```javascript
const SKILLS_DATA = [
  {
    name: "AI_PM 主控",
    command: "/ai-pm",
    icon: "🎯",
    desc: "完整产品流程，从需求到原型",
    usage: "/ai-pm \"你的产品想法\"",
    scenarios: [
      "全新项目启动，需要全流程指导",
      "快速验证一个产品想法",
      "初学者体验 AI_PM 的最佳入口"
    ],
    example: {
      title: "记账小程序",
      description: "你想做一个帮助年轻人管理开支的小程序",
      command: "/ai-pm \"我想做一个记账小程序，帮助年轻人管理日常开支\"",
      result: "AI 会问你目标用户、核心功能等问题，然后自动生成完整的 PRD 和原型"
    }
  },
  {
    name: "需求分析",
    command: "/pm-analyze",
    icon: "💬",
    desc: "深度访谈澄清需求",
    usage: "/pm-analyze [--file=需求文件路径]",
    scenarios: [
      "需求不够清晰，需要深入挖掘",
      "已有初步想法，需要系统化梳理",
      "需要产出用户画像和痛点分析"
    ],
    example: {
      title: "在线教育平台需求分析",
      description: "你想做一个在线教育平台，但不确定具体功能",
      command: "/pm-analyze",
      result: "AI 通过多轮对话，帮你明确目标用户、核心场景、功能优先级"
    }
  },
  {
    name: "竞品研究",
    command: "/pm-research",
    icon: "🔍",
    desc: "分析市场竞争格局",
    usage: "/pm-research \"竞品类型\" [--depth=basic|standard|deep]",
    scenarios: [
      "进入新市场前了解竞争格局",
      "寻找差异化机会",
      "分析竞品的优劣势"
    ],
    example: {
      title: "在线文档工具竞品分析",
      description: "你想做一个在线协作文档工具",
      command: "/pm-research \"在线文档协作\" --depth=deep",
      result: "AI 分析 Notion、飞书、腾讯文档等竞品，找出市场空白和你的差异化机会"
    }
  },
  {
    name: "PRD 生成",
    command: "/pm-prd",
    icon: "📝",
    desc: "输出专业需求文档",
    usage: "/pm-prd [--style=风格] [--template=模板]",
    scenarios: [
      "需要正式的产品需求文档",
      "准备向开发团队讲解需求",
      "需要文档留存和版本管理"
    ],
    example: {
      title: "电商 App PRD",
      description: "已经完成了需求分析，需要生成正式 PRD",
      command: "/pm-prd --style=standard",
      result: "生成包含 8 个章节的完整 PRD：修订记录、需求分析、功能清单、流程图、全局说明、详细设计、效果验证、非功能性说明"
    }
  },
  {
    name: "原型设计",
    command: "/pm-prototype",
    icon: "🎨",
    desc: "生成交互式网页原型",
    usage: "/pm-prototype [--platform=web|mobile] [--prd=PRD文件路径]",
    scenarios: [
      "需要可视化展示产品方案",
      "准备用户测试",
      "向投资人演示产品"
    ],
    example: {
      title: "社交 App 原型",
      description: "基于 PRD 生成交互原型",
      command: "/pm-prototype --platform=mobile",
      result: "生成可在手机浏览器打开的原型，包含页面跳转、基础交互，可直接分享给团队体验"
    }
  },
  {
    name: "需求评审",
    command: "/pm-review",
    icon: "👥",
    desc: "多角色专业评审",
    usage: "/pm-review [--roles=角色列表]",
    scenarios: [
      "PRD 完成后找问题",
      "准备开发前最后检查",
      "需要多角度评估方案"
    ],
    example: {
      title: "方案评审",
      description: "PRD 和原型都做好了，需要专业评审",
      command: "/pm-review",
      result: "AI 扮演研发总监、架构师、产品经理、设计师等 9 个角色，从不同角度提出问题和改进建议"
    }
  },
  {
    name: "用户故事",
    command: "/pm-story",
    icon: "📖",
    desc: "编写用户故事和用例",
    usage: "/pm-story",
    scenarios: [
      "敏捷开发需要用户故事",
      "需要明确的验收标准",
      "细化功能点的使用场景"
    ],
    example: {
      title: "购物车用户故事",
      description: "需要细化购物车功能的用户故事",
      command: "/pm-story",
      result: "生成多条用户故事，每条包含角色、功能、价值、验收标准"
    }
  },
  {
    name: "数据分析",
    command: "/pm-analytics",
    icon: "📊",
    desc: "指标体系和埋点设计",
    usage: "/pm-analytics [--prd=PRD文件路径] [--focus=关注点]",
    scenarios: [
      "产品上线前设计数据指标",
      "需要设计埋点方案",
      "规划数据看板"
    ],
    example: {
      title: "电商产品数据分析",
      description: "需要设计完整的指标体系",
      command: "/pm-analytics --focus=conversion",
      result: "设计北极星指标、核心指标、埋点事件、数据看板规划"
    }
  },
  {
    name: "数据洞察",
    command: "/pm-data",
    icon: "💡",
    desc: "从数据中发现洞察",
    usage: "/pm-data --file=数据文件路径 [--format=csv|json|excel]",
    scenarios: [
      "已有用户行为数据，需要分析",
      "发现数据中的问题和机会",
      "基于数据优化产品"
    ],
    example: {
      title: "用户行为分析",
      description: "拿到了用户行为数据 CSV 文件",
      command: "/pm-data --file=user_behavior.csv",
      result: "AI 分析数据，发现用户流失点、活跃时段、功能使用频率，并给出产品优化建议"
    }
  },
  {
    name: "配置管理",
    command: "/pm-config",
    icon: "⚙️",
    desc: "写作风格和 UI 规范",
    usage: "/pm-config [get|set|list] [配置项] [值]",
    scenarios: [
      "设置默认的 PRD 写作风格",
      "配置 UI 规范",
      "查看当前配置"
    ],
    example: {
      title: "设置写作风格",
      description: "想让 PRD 按公司规范生成",
      command: "/pm-config set style enterprise",
      result: "后续生成的 PRD 将使用企业级详细规范模板"
    }
  },
  {
    name: "项目仪表盘",
    command: "/pm-dashboard",
    icon: "📈",
    desc: "可视化进度追踪",
    usage: "/pm-dashboard",
    scenarios: [
      "查看所有项目进度",
      "管理多个产品需求",
      "导出项目报告"
    ],
    example: {
      title: "查看项目状态",
      description: "同时进行了多个项目，想看进度",
      command: "/pm-dashboard",
      result: "显示所有项目的状态、进度、下一步任务，一目了然"
    }
  },
  {
    name: "代理团队",
    command: "/agent-team",
    icon: "🤖",
    desc: "多角色协同工作",
    usage: "/agent-team \"需求描述\" [--mode=serial|parallel|agile] [--roles=角色列表]",
    scenarios: [
      "复杂项目需要团队协作",
      "需要专业分工（PM+架构+设计）",
      "时间紧迫需要并行工作"
    ],
    example: {
      title: "智能客服系统",
      description: "做一个企业级智能客服系统，比较复杂",
      command: "/agent-team \"开发一个智能客服系统\" --mode=serial",
      result: "AI 调度产品经理、架构师、设计师、数据分析师协同工作，产出完整方案"
    }
  }
];
```

## 5. 使用场景描述规范

每个技能必须提供 3 个使用场景：
1. **高频场景**：最常用的场景
2. **痛点场景**：解决具体问题的场景
3. **入门场景**：新手第一次使用的场景

场景描述格式：
- 以动词开头
- 具体而非抽象
- 避免"等"、"等等"（不完整的列举）

## 6. 示例案例规范

每个示例必须包含：
1. **标题**：场景名称（4-6个字）
2. **背景**：一句话描述当前情况
3. **命令**：完整的可执行命令
4. **结果**：明确说明产出物

示例应该：
- 真实可信
- 覆盖主要功能点
- 让用户有代入感

## 7. 导航文案

### 7.1 主导航
- 首页
- 指南
- 技能
- GitHub

### 7.2 CTA 按钮
- 主按钮："开始体验"
- 次按钮："浏览技能"

## 8. 更新记录

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-03-01 | 1.0 | 初始版本，定义 12 个技能规范 |

---

**审核流程**：所有内容更新需对照此规范检查，确保一致性。
