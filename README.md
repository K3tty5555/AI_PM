# AI_PM - AI 产品经理 (v2.1.0)

一个模仿产品经理工作流的 Claude Code 技能套件。将简短的需求描述转化为完整、专业的产品需求文档（PRD）。

**核心特点**：支持多项目管理，每个需求独立存放，清晰不混乱。

---

## 🚀 30秒快速开始

```bash
# 1. 安装：将 AI_PM 文件夹放入项目根目录

# 2. 启动 Claude Code
claude

# 3. 创建第一个项目
/ai-pm "我想做一个记账小程序，帮助年轻人管理日常开支"

# 4. 跟随 AI 引导完成需求访谈
# 5. 自动获得完整 PRD 文档 + 可交互原型
```

---

## ✨ 功能特点

| 功能 | 说明 |
|------|------|
| 💬 **需求分析** | 深度访谈澄清需求，输出结构化分析报告 |
| 🔍 **竞品研究** | 分析市场竞争格局，识别差异化机会 |
| 👤 **用户故事** | 编写详细的用户故事和验收标准 |
| 📝 **PRD 生成** | 输出专业级产品需求文档（支持自定义模板） |
| ✍️ **写作风格** | 分析你的 PRD 写作风格（章节结构、用词习惯），生成风格配置 |
| 🎨 **原型生成** | 生成交互式网页原型（HTML+CSS+JS） |
| 🔗 **参考网页分析** | 抓取现有系统或竞品网页，支持账号密码登录 |
| 👥 **需求评审** | 九大角色（研发/架构/产品/设计/项目/QA/安全/运营/数据）专业评审 |
| 🔄 **多轮迭代** | 基于评审意见多次修改，直到方案成熟 |
| 📉 **数据分析** | 指标体系设计、埋点方案、A/B测试、数据看板规划 |
| 📊 **数据洞察** | 上传数据文件，发现业务洞察，从数据中提炼产品需求（集成于ai-pm-data） |
| ⚡ **快速模式** | 15分钟快速输出，支持4种工作流模式 |
| 👤 **用户分层** | 新手/专业/专家模式，个性化体验 |
| 📁 **多项目管理** | 每个需求独立项目文件夹，避免混乱 |
| 📚 **知识沉淀** | 自动沉淀设计模式、决策记录、踩坑经验 |
| 📊 **项目仪表盘** | 可视化进度追踪、健康度评估、多项目对比 |
| 🎨 **设计规范** | 统一管理UI规范，确保原型风格一致 |
| ✍️ **写作风格** | 分析你的PRD风格，生成个性化文档 |
| 🤖 **AI 代理团队** | 多专业角色协同工作（PM/架构师/设计师/数据分析师） |
| 🎤 **现场调研** | 线下客户访谈，现场生成PRD和原型 |
| 🌐 **浏览器自动化** | Playwright 网页测试和数据抓取 |
| 📖 **教程中心** | 自动更新教程中心，Skill化维护 |

---

## 📂 目录结构

```
AI_PM/
├── .claude/skills/           # 技能定义（无需修改）
│   ├── ai-pm/                # 主控技能
│   ├── ai-pm-analyze/        # 需求分析
│   ├── ai-pm-research/       # 竞品研究
│   ├── ai-pm-story/          # 用户故事
│   ├── ai-pm-prd/            # PRD 生成
│   ├── ai-pm-data/           # 数据分析与数据洞察
│   ├── ai-pm-prototype/      # 原型生成
│   ├── ai-pm-review/         # 需求评审
│   ├── ai-pm-knowledge/      # 知识库管理
│   ├── ai-pm-interview/      # 现场调研
│   ├── ai-pm-config/         # 配置管理（UI规范、写作风格）
│   ├── agent-team/           # AI 代理团队
│   ├── playwright-cli/       # 浏览器自动化
│   └── tutorial-center-update/ # 教程中心更新
│
├── output/                   # 产出目录
│   ├── projects/             # 所有项目
│   │   ├── project-a-20260228/
│   │   │   ├── 00-reference-analysis.md    # 参考网页分析（可选）
│   │   │   ├── 01-requirement-draft.md     # 需求澄清
│   │   │   ├── 02-analysis-report.md       # 需求分析
│   │   │   ├── 03-competitor-report.md     # 竞品研究
│   │   │   ├── 04-user-stories.md          # 用户故事
│   │   │   ├── 05-PRD-v1.0.md              # PRD文档
│   │   │   ├── 06-prototype/               # 网页原型
│   │   │   ├── 07-references/              # 参考资源（可选）
│   │   │   │   ├── reference-config.md     # 参考资源配置
│   │   │   │   └── images/                 # 参考图片
│   │   │   ├── 08-review-report-v1.md      # 需求评审报告（可选）
│   │   │   ├── 09-analytics-requirement.md # 数据分析需求（可选）
│   │   │   ├── 10-data-insight-report.md   # 数据洞察报告（可选）
│   │   │   ├── 11-data-driven-requirements.md # 数据驱动需求（可选）
│   │   │   └── 12-data-insight-dashboard/  # 交互式数据洞察仪表盘（可选）
│   │   │       ├── index.html              # 主页面
│   │   │       ├── insights.html           # 洞察详情页
│   │   │       ├── charts.html             # 图表分析页
│   │   │       ├── assets/                 # 资源文件
│   │   │       └── export/                 # 导出文件
│   │   └── project-b-20260301/
│   └── .current-project      # 记录当前项目
│
└── templates/                # 全局模板（跨项目共享）
    ├── 00-examples/          # 示例文件
    ├── 01-config/            # 配置模板
    │   ├── reference-config.md  # 参考资源配置模板
    │   ├── project-config.json  # 项目配置模板
    │   └── project-config-schema.json # 配置Schema
    ├── 02-retrospective/     # 复盘模板
    ├── ui-specs/             # ✅ UI 规范库
    │   ├── README.md
    │   ├── enterprise-sample/
    │   └── [用户自定义规范]/
    ├── prd-styles/           # ✅ PRD 写作风格库
    │   ├── README.md
    │   ├── default/
    │   └── [用户自定义风格]/
    └── knowledge-base/       # ✅ 知识库
        ├── patterns/         # 设计模式
        ├── decisions/        # 决策记录
        ├── pitfalls/         # 踩坑记录
        └── playbooks/        # 场景手册
```

---

## 📖 使用方式

### 方式1：从零开始（最常用）

```bash
/ai-pm "你的需求描述"
```

AI 会引导你完成需求澄清 → 分析 → 竞品 → 故事 → PRD → 原型的完整流程。

### 方式2：基于现有系统迭代

**单个网页**：
```bash
/ai-pm https://your-company.com/existing-system
```

**多个网页+图片**（推荐）：

在项目内创建 `07-references/reference-config.md`，填写多个URL、账号密码、说明，并放入参考图片：

```
07-references/
├── reference-config.md    # 多个URL和账号密码
└── images/
    ├── homepage.png       # 首页截图
    └── workflow.gif       # 操作流程
```

然后执行：
```bash
/ai-pm fetch
```

AI 会批量分析所有参考资源，并生成综合分析报告。

### 方式3：基于竞品对标

```bash
/ai-pm https://competitor.com/product
```

AI 会分析竞品功能，进入「对标开发」模式，帮你输出差异化方案。

---

## ⌨️ 常用命令速查

| 命令 | 作用 |
|------|------|
| `/ai-pm "需求"` | 创建新项目 |
| `/ai-pm` | 继续当前项目（断点续传） |
| `/ai-pm list` | 列出所有项目 |
| `/ai-pm status` | 查看当前项目状态 |
| `/ai-pm switch {项目名}` | 切换到指定项目 |
| `/ai-pm prototype` | 生成网页原型 |
| `/ai-pm review` | 需求评审（九大角色） |
| `/ai-pm prd` | 仅生成 PRD |
| `/ai-pm data analytics` | 数据分析与埋点设计 |
| `/ai-pm data insight {文件}` | 数据洞察与需求发现 |
| `/ai-pm data insight --focus=conversion` | 聚焦转化率分析 |
| `/ai-pm data insight --visualize` | 生成交互式可视化报告 |
| `/ai-pm data insight dashboard` | 基于已有分析生成仪表盘 |
| `/ai-pm config ui-spec` | 管理 UI 设计规范 |
| `/ai-pm config ui-spec upload {名称}` | 上传并解析 UI 规范 |
| `/ai-pm config writing-style` | 管理 PRD 写作风格 |
| `/ai-pm config writing-style analyze {文件}` | 分析 PRD 写作风格 |
| `/ai-pm knowledge search {关键词}` | 搜索产品知识库 |
| `/ai-pm knowledge suggest` | 推荐相关知识 |
| `/ai-pm https://...` | 分析参考网页 |
| `/ai-pm interview "功能名"` | 现场调研/客户访谈 |
| `/playwright-cli open https://...` | 浏览器自动化 |
| `/tutorial-center-update` | 更新教程中心 |

---

## 📚 详细文档

- **[AI_PM_教程中心.html](./AI_PM_教程中心.html)** - 统一教程门户（新手引导 + 完整教程 + 更新日志）

打开一个文件即可获得：
- 🏠 首页：快速了解四种工作流和核心能力
- 📚 完整教程：详细的八章使用指南
- 📝 更新日志：版本历史和功能对比

---

## 🎯 工作流程

### 标准模式（完整流程）

```
用户输入需求/URL
    ↓
Phase 0 (可选): 参考网页分析
    ↓ 保存 00-reference-analysis.md
Phase 1: 需求澄清（深度访谈）
    ↓ 保存 01-requirement-draft.md
Phase 2: 需求分析
    ↓ 保存 02-analysis-report.md
Phase 3: 竞品研究
    ↓ 保存 03-competitor-report.md
Phase 4: 用户故事
    ↓ 保存 04-user-stories.md
Phase 5: PRD 生成
    ↓ 保存 05-PRD-v1.0.md
Phase 6: 数据分析（可选）
    ↓ 保存 09-analytics-requirement.md
Phase 7: 原型生成（可选）
    ↓ 保存 06-prototype/
Phase 8: 需求评审（可选，支持多轮）
    ↓ 保存 08-review-report-v1.md
    ↓ 修改后 → 05-PRD-v1.1.md
✅ 完成
```

### 数据驱动模式（从数据开始）

```
用户上传数据文件
    ↓
Phase 0: 数据洞察（交互式分析）
    • 解析数据文件（Excel/CSV/JSON等）
    • 探索性数据分析（EDA）
    • 多轮交互提问，挖掘潜在需求
    ↓ 保存 10-data-insight-report.md
Phase 1: 数据驱动需求提炼
    • 将数据洞察转化为产品需求
    • 基于问题诊断确定优化方向
    ↓ 保存 11-data-driven-requirements.md
Phase 2-8: 标准产品流程
    ↓
可选择：数据分析指标设计
    ↓ 保存 09-analytics-requirement.md
Phase 7: 原型生成
    ↓ 保存 06-prototype/
✅ 完成
```

### 快速模式（15分钟）

```
用户输入需求
    ↓
Phase 1: 需求澄清（简化版）
    ↓ 保存 01-requirement-draft.md
Phase 5: PRD 生成
    ↓ 保存 05-PRD-v1.0.md
Phase 6: 原型生成
    ↓ 保存 06-prototype/
✅ 完成
```

### 工作流模式对比

| 模式 | 流程阶段 | 预计耗时 | 适用场景 |
|------|----------|----------|----------|
| ⚡ **快速模式** | 澄清 → PRD → 原型 | 15分钟 | 简单需求、时间紧迫 |
| 📊 **标准模式** | Phase 1-8 | 45分钟 | 常规项目（推荐） |
| 🔬 **深度模式** | Phase 0-8 + 多轮评审 | 2小时 | 复杂系统、企业项目 |
| 📈 **数据驱动模式** | 数据洞察 → 需求提炼 → 产品流程 | 60分钟 | 有数据、需挖掘需求 |
| 🎯 **自适应模式** | AI根据复杂度自动选择 | 动态 | 不确定时的最佳选择 |

---

## 💡 使用示例

**示例1：简单需求**
```bash
/ai-pm "做一个番茄钟 App，帮助用户专注工作"
```

**示例2：复杂需求**
```bash
/ai-pm "开发一个智能客服系统，能自动回复常见问题，
支持多渠道接入（微信、网页、APP），并且可以转接人工客服"
```

**示例3：系统升级**
```bash
/ai-pm https://company-intranet.com/old-system
# 输入账号密码 → 选择「迭代优化」→ 获得升级方案
```

**示例4：竞品对标**
```bash
/ai-pm https://competitor.com/product
# 选择「对标开发」→ 获得差异化方案
```

**示例5：需求评审**
```bash
# 原型生成后自动提示是否评审
# 或手动触发评审
/ai-pm review

# 进行第二轮评审
/ai-pm review --round=2
```

**示例6：数据洞察驱动需求（从数据中发现产品机会）**
```bash
# 上传数据文件，AI自动分析并挖掘需求
/ai-pm data-insight ./user_behavior_data.xlsx

# 聚焦转化率分析
/ai-pm data-insight ./conversion_data.csv --focus=conversion

# 分析后，AI会：
# 1. 解析数据并评估数据质量
# 2. 进行探索性数据分析（EDA）
# 3. 识别用户行为模式和业务洞察
# 4. 通过多轮交互提问，引导你关注核心问题
# 5. 基于数据洞察提炼产品需求
# 6. 驱动完整产品流程（PRD → 原型）
```

**示例7：数据分析与埋点设计**
```bash
# 基于PRD设计数据指标体系
/ai-pm data analytics

# 交互式设计指标体系
/ai-pm data analytics design
```

**示例8：生成交互式数据洞察报告（可视化仪表盘）**
```bash
# 分析数据并生成交互式可视化报告
/ai-pm data insight ./sales_data.xlsx --visualize

# 基于已有洞察报告生成仪表盘
/ai-pm data insight dashboard --input=10-data-insight-report.md

# 生成后打开仪表盘
open 12-data-insight-dashboard/index.html

# 仪表盘功能：
# - 📊 核心指标卡片（DAU/转化率/留存/客单价）
# - 📈 趋势图表（ECharts）
# - 🔻 转化漏斗可视化
# - 🎨 用户行为热力图
# - 💡 洞察卡片（严重程度分级）
# - 🌓 暗/亮主题切换
# - 📄 一键导出PDF
```

**示例9：现场调研（v2.1.0新增）**
```bash
# 针对已有功能进行现场调研
/ai-pm interview "CRM系统"

# 指定项目进行现场访谈
/ai-pm interview --project=myproject
```

**示例10：浏览器自动化（v2.1.0新增）**
```bash
# 抓取参考网页进行分析
/playwright-cli open https://example.com

# 截图保存
/playwright-cli screenshot --filename=page.png
```

**示例11：教程中心自动更新（v2.1.0新增）**
```bash
# 一键更新教程中心（扫描skills → 生成HTML → Agent调优）
/tutorial-center-update

# 预览变更（不写入文件）
/tutorial-center-update preview

# 同步检查（对比差异）
/tutorial-center-update sync
```

**示例12：快速模式（v1.4新增）**
```bash
# 15分钟快速输出（需求澄清 → PRD → 原型）
/ai-pm quick "做一个记账小程序"

# 仅快速生成PRD
/ai-pm quick-prd "做一个记账小程序"

# 完整流程，但选择工作流模式
/ai-pm "做一个记账小程序"
# → 选择：快速模式 / 标准模式 / 深度模式 / 自适应
```

---

## 🤖 AI 代理团队

AI_PM 现在支持**多代理协作模式**，模拟真实的产品团队工作方式。

### 代理角色

| 代理 | 角色 | 专长 | 职责 |
|-----|------|------|------|
| 🎯 **产品经理** | PM | 需求分析、PRD编写 | 需求澄清、竞品分析、PRD |
| 🏗️ **架构师** | Architect | 技术架构、系统设计 | 架构设计、技术选型 |
| 🎨 **UI设计师** | Designer | 交互设计、视觉设计 | 原型设计、设计规范 |
| 📊 **数据分析师** | Analyst | 数据分析、洞察挖掘 | 数据分析、洞察报告 |
| 📝 **技术文档工程师** | Writer | 技术写作、文档规范 | 文档编写、格式整理 |

### 使用方式

```bash
# 启动完整代理团队处理项目
/agent-team "开发一个智能客服系统"

# 指定特定角色
/agent-team --roles=pm,architect "做一个记账App"

# 指定协作模式
/agent-team --mode=agile "设计一个社交产品"

# 查看团队状态
/agent-team status

# 单独调用某个代理
/agent-team pm "需求分析"
/agent-team architect "架构设计"
/agent-team designer "原型设计"
```

### 协作模式

**串行模式**（Sequential）- 适合复杂项目
```
PM → Architect → Designer → PM(整合)
```

**并行模式**（Parallel）- 适合独立子任务
```
        ┌→ PM(竞品)
用户 → ┼→ 数据分析师
        └→ PM(需求)
              ↓
           汇总整合
```

**敏捷模式**（Agile）- 适合需求不明确
```
迭代1：PM澄清 → 快速原型 → 用户反馈
迭代2：细化需求 → 完善设计 → 用户反馈
迭代3：PRD定稿 → 终稿交付
```

### 质量门禁

每个阶段必须通过质量检查：
```
需求澄清 → [PM自检] → [用户确认] → ✅
竞品分析 → [PM自检] → [数据交叉审核] → ✅
架构设计 → [架构师自检] → [PM业务审核] → ✅
UI设计 → [设计师自检] → [PM+架构师审核] → ✅
PRD → [PM自检] → [全体审核] → [用户确认] → ✅
```

---

## 🔧 自定义

- 修改 `.claude/skills/ai-pm-analyze/SKILL.md` 自定义分析框架
- 修改 `.claude/skills/ai-pm-prd/SKILL.md` 自定义 PRD 模板
- 所有 skill 都是 Markdown 文件，可直接编辑

---

## 📝 License

MIT

---

**遇到问题？** 打开 [AI_PM_教程中心.html](./AI_PM_教程中心.html) 查看详细教程
