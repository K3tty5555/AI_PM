<h1 align="center">AI PM</h1>
<p align="center">
  有状态的产品经理工作台 — 覆盖探索、决策、PRD、原型、评审验收和效果回收。
</p>
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
</p>
<p align="center">
  <a href="README.md">English</a> | <a href="README_zh-CN.md">简体中文</a>
</p>

> [!NOTE]
> **Tauri 桌面客户端已于 2026-07-17 退役，源码已从本仓移除。** 历史安装包仅留在 GitHub Releases 上、不再维护。AI_PM 的活跃形态是下方的 **Claude Code skills** 版。

---

## 这是什么

AI PM 是一个有状态的产品经理工作台。用户通过探索研究、决策分析、PRD、原型、评审验收、运营复盘六种模式进入任务；底层继续使用现有项目 phase/status，因此旧项目仍可断点续传。它以一组 Claude Code 技能和 PM sub-agent 的形态运行。

## 当前能力

### 产品工作流

```text
需求速评 → 需求收集 → 需求分析 → 竞品研究 → 用户故事 → PRD → 埋点设计 → 原型 → 需求评审 → 项目复盘
```

- 9 个核心阶段，正式写作前可先做需求速评
- 每个阶段独立保存，支持恢复和跳过
- PM agent / driver 工作流用于评审前的 PRD 质量守门

### 六种工作模式

| 模式 | 主要产出 |
|------|----------|
| 探索研究 | 事实、洞察和明确的未知项 |
| 决策分析 | 方案比较、推荐和决策记录 |
| PRD | 可评审的 Markdown 产品需求文档 |
| 原型 | 有当前产品证据的可交互原型 |
| 评审验收 | 文档问题或真实实现证据 |
| 运营复盘 | 效果回收、项目复盘和可复用知识 |

模式只是任务意图层，不是第二套状态机；phase、checkpoint 和 `last_phase` 仍是项目生命周期单源。

### PRD 与评审

- **Markdown-first PRD** 作为主源
- **版本管理**：按阶段分文件夹 + 版本索引
- 支持 **AI 插图** 生成并嵌入 PRD
- 六角色评审覆盖产品、设计、前端、后端、测试、运营视角

### 本地化 PM 方法

借鉴成熟 PM 方法、**按中国大陆企业现实重新落地**——是本地化、不是翻译。每个都过本地化过滤器、配大陆反例，扩进现有技能而不新增命令面：

- **上线前风险预演（pre-mortem）**：六角色评审前先做，带通用「红线 / 合规」槽位
- **假设-验证纪律**：需求分析时标清「在赌什么 + 怎么花小代价先验」
- **数据严谨度**：分群留存（cohort）、留存曲线、A/B 显著性、北极星收敛、用户反馈主题 / 情感分析
- **竞品对标卡（battlecard）**：面向销售 / 客户压力场景
- **协作地图 + 客户决策地图**：内部对齐 + B/G 端多层客户决策链
- **上线文档套件**：从实际上线功能生成更新公告 + 操作手册，可发飞书云文档（`/ai-pm release-docs`）

### 导出和工具

| 模块 | 覆盖内容 |
|------|----------|
| PRD 导出 | PDF、DOCX、分享页和配套导出脚本 |
| 产品工具 | 需求优先级、工作周报、现场调研、数据洞察 |
| 知识工具 | 产品分身、设计规范、产品知识库 |
| 原型 | HTML 原型、设备预览、动效档位、多文件模式 |
| AI 协作 | Claude 优先的项目 memory，并生成 Codex 可读的共享索引 |

## 快速开始

```bash
git clone <repository-url>
cd AI_PM
claude
```

然后输入：

```text
/ai-pm "我想做一个记账小程序，帮助年轻人管理日常开支"
```

AI PM 会先引导需求澄清，再推进完整产品工作流。

HTML 原型和仪表盘默认使用项目自带的 `ai-pm-frontend-design` 技能。外部 Claude Code 插件（如 `impeccable`）仅作可选增强，不是运行时必需。

## Claude Code 命令速查

| 命令 | 说明 |
|------|------|
| `/ai-pm [需求]` | 主产品工作流入口 |
| `/ai-pm explore [任务]` | 探索研究模式 |
| `/ai-pm decide [任务]` | 决策分析模式 |
| `/ai-pm prd [需求或路径]` | PRD 独立一级入口 |
| `/ai-pm prototype [项目]` | 原型模式，迭代项目先核 source/target |
| `/ai-pm review [对象]` | 评审验收模式 |
| `/ai-pm operate [任务]` | impact、复盘、周报、知识或分享 |
| `/ai-pm reconcile` | 范围变化后的跨产物只读影响预览 |
| `/ai-pm impact` | 发布后效果回收，允许证据不足继续观察 |
| `/ai-pm retrospective --system` | 只读脱敏索引/摘要的 AI_PM 系统复盘 |
| `/ai-pm office-hours` | 早期需求讨论 / 可行性速评 |
| `/ai-pm --team [需求]` | 复杂需求的多 Agent 协作 |
| `/ai-pm continue` | 恢复上次未完成项目 |
| `/ai-pm driver [PRD]` | 评审前 PM 风格质量守门 |
| `/ai-pm sharing [主题或素材路径]` | 写可独立阅读的经验分享文章，不是 PRD、复盘或培训讲义 |
| `/ai-pm-sharing` | 同一经验分享文章 Skill 的独立入口 |
| `/ai-pm-prd` | 生成或更新 PRD |
| `/ai-pm-data metrics` | 埋点和指标设计 |
| `/ai-pm-prototype` | 生成可交互 HTML 原型 |
| `/ai-pm-review` | 六角色需求评审 |
| `/ai-pm retrospective` | 项目复盘和知识沉淀 |
| `/ai-pm strategy` | 战略沙盘——项目级 / 产品级战略推演 |
| `/ai-pm-strategy-verify` | 战略求证侦察兵——证据挖到尽头，交回反转+岔路，不替你拍板 |
| `/ai-pm acceptance [PRD]` | 产品验收——对照 PRD 在测试环境逐条核实实现，出提单台账 |
| `/ai-pm release-docs [PRD\|项目]` | 上线文档套件——从实际上线功能生成更新公告 + 操作手册，可发飞书 |
| `/ai-pm-priority` | 需求优先级评估 |
| `/ai-pm-weekly` | 工作周报生成 |
| `/ai-pm-interview` | 现场调研 / 客户访谈 |
| `/ai-pm-persona` | 产品分身 / 写作风格学习 |
| `/ai-pm-design-spec` | 设计规范管理 |
| `/ai-pm-knowledge` | 产品知识库 |
| `/pm-gap-research` | 差距导向的产品研究 |
| `/multi-perspective-review` | 多视角评审 |
| `/tutorial-center-update` | 更新离线教程中心 |

核心独立技能：`/ai-pm-analyze`、`/ai-pm-research`、`/ai-pm-story`、`/ai-pm-prd`、`/ai-pm-prototype`、`/ai-pm-review`、`/ai-pm-sharing`。

## 技术栈

| 层 | 技术 |
|----|------|
| AI 技能 | Claude Code 项目技能 + 2 个 sub-agent（pm-agent / prototype-agent）|
| 导出脚本 | Python 3、Node 脚本、Chrome PDF 渲染 |
| AI 协作上下文 | `.ai-shared` 索引和 `scripts/ai-sync` 检查脚本 |

## 项目结构

```text
.claude/skills/                    # Claude Code 项目技能
.claude/agents/                    # 2 个 sub-agent：pm-agent（PRD 守门）、prototype-agent（原型审计）
.ai-shared/                        # Claude / Codex 共享 memory、skill、agent 索引
scripts/ai-sync/                   # 索引生成和上下文漂移检查
templates/                         # PRD 风格、UI 规范、知识库、预设配置
docs/                              # 本机规划文档（gitignore，不随仓分发）
output/                            # 本机产出，不纳入版本库
output/sharing/articles/           # 可独立阅读的经验分享文章
AI_PM_教程中心.html                 # 离线交互式教程
```

`output/` 顶层容器的唯一注册表是 `.claude/skills/ai-pm/references/output-containers.md`。

## 使用教程

打开项目根目录的 `AI_PM_教程中心.html`，浏览器直接打开即可，离线可用，覆盖 Claude Code 版。

## 许可证

[MIT](LICENSE)
