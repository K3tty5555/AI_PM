<p align="center">
  <img src="app/src-tauri/icons/128x128@2x.png" width="96" alt="AI PM">
</p>
<h1 align="center">AI PM</h1>
<p align="center">
  AI 产品经理能力套件 — 从需求澄清到 PRD、埋点、原型、评审和复盘。
</p>
<p align="center">
  <a href="https://github.com/K3tty5555/AI_PM/releases"><img src="https://img.shields.io/github/v/release/K3tty5555/AI_PM?style=flat-square" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License"></a>
</p>
<p align="center">
  <a href="README.md">English</a> | <a href="README_zh-CN.md">简体中文</a>
</p>

---

## 这是什么

AI PM 是一套 AI 产品经理能力套件。你可以从一句粗糙想法开始，让 AI 帮你澄清需求、分析用户和竞品、拆用户故事、写 PRD、设计埋点、生成 HTML 原型、做六角色评审，并把项目经验沉淀下来。

项目目前有两种互补形态：

| | Claude Code 版 | 桌面客户端 |
|---|---|---|
| 形态 | Claude Code skills + PM agent | macOS / Windows 独立桌面应用 |
| 交互 | 命令行对话 | GUI 可视化操作 |
| 前置条件 | [Claude Code](https://claude.ai/code) 订阅 | API Key、OpenAI 兼容接口或本地 Claude CLI |
| 核心优势 | 原生工具链、可搜索 memory、脚本、sub-agent | 项目看板、阶段页面、PRD 编辑、功能广场、导出 |

## 当前能力

### 产品工作流

```text
需求速评 → 需求收集 → 需求分析 → 竞品研究 → 用户故事 → PRD → 埋点设计 → 原型 → 需求评审 → 项目复盘
```

- 9 个核心阶段，正式写作前可先做需求速评
- 每个阶段独立保存，支持恢复和跳过
- PM agent / driver 工作流用于评审前的 PRD 质量守门
- Claude Code skills 和桌面客户端共用同一套产品流程语义

### PRD 与评审

- **Markdown-first PRD** 作为主源
- 客户端支持 **PRD 版本列表** 和 **版本差异对比**
- 客户端支持 **PRD 多维评分**
- 客户端内置 **PRD 助手**，可做定向修改并查看待应用差异
- 支持 **AI 插图** 生成并嵌入 PRD
- 六角色评审覆盖产品、设计、前端、后端、测试、运营视角

### 导出和工具

| 模块 | 覆盖内容 |
|------|----------|
| PRD 导出 | PDF、DOCX、分享页和配套导出脚本 |
| 产品工具 | 需求优先级、工作周报、现场调研、数据洞察 |
| 知识工具 | 产品分身、设计规范、产品知识库 |
| 功能广场 | 图片、文档、内容、视频/音频、翻译、压缩、社媒发布工具 |
| 原型 | HTML 原型、设备预览、动效档位、多文件模式 |
| AI 协作 | Claude 优先的项目 memory，并生成 Codex 可读的共享索引 |

### 桌面客户端特色

- 项目 Dashboard：搜索、过滤、收藏、进度状态
- 10 个项目页面：需求速评、需求收集、需求分析、竞品研究、用户故事、PRD、埋点设计、原型、评审、复盘
- StoryBoard 用户故事拖拽排序和编辑
- PRD 目录、Mermaid 渲染、评分、版本对比、助手面板、AI 插图弹窗
- 原型支持手机、平板、笔记本、桌面设备预览
- 功能广场基于本地 bundled skills 和 manifest
- 三种 AI 后端：Anthropic API、OpenAI 兼容接口、Claude CLI
- 暗色模式、快捷键、原生菜单、更新检查

## 快速开始

### 方式一：Claude Code 版

```bash
git clone https://github.com/K3tty5555/AI_PM.git
cd AI_PM
claude
```

然后输入：

```text
/ai-pm "我想做一个记账小程序，帮助年轻人管理日常开支"
```

AI PM 会先引导需求澄清，再推进完整产品工作流。

### 方式二：桌面客户端

从 [Releases](https://github.com/K3tty5555/AI_PM/releases) 下载安装包：

- macOS：`AI.PM_x.x.x_universal.dmg`
- Windows：`AI.PM_x.x.x_x64-setup.exe`

首次启动后在设置页配置一个 AI 后端：

- **Anthropic API**：填写 API Key
- **OpenAI 兼容接口**：填写 Base URL + Key
- **Claude CLI**：复用本机已登录的 Claude Code

## Claude Code 命令速查

| 命令 | 说明 |
|------|------|
| `/ai-pm [需求]` | 主产品工作流入口 |
| `/ai-pm office-hours` | 早期需求讨论 / 可行性速评 |
| `/ai-pm --team [需求]` | 复杂需求的多 Agent 协作 |
| `/ai-pm continue` | 恢复上次未完成项目 |
| `/ai-pm driver [PRD]` | 评审前 PM 风格质量守门 |
| `/ai-pm-prd` | 生成或更新 PRD |
| `/ai-pm-data metrics` | 埋点和指标设计 |
| `/ai-pm-prototype` | 生成可交互 HTML 原型 |
| `/ai-pm-review` | 六角色需求评审 |
| `/ai-pm retrospective` | 项目复盘和知识沉淀 |
| `/ai-pm-priority` | 需求优先级评估 |
| `/ai-pm-weekly` | 工作周报生成 |
| `/ai-pm-interview` | 现场调研 / 客户访谈 |
| `/ai-pm-persona` | 产品分身 / 写作风格学习 |
| `/ai-pm-design-spec` | 设计规范管理 |
| `/ai-pm-knowledge` | 产品知识库 |
| `/pm-gap-research` | 差距导向的产品研究 |
| `/multi-perspective-review` | 多视角评审 |
| `/ai-pm-brainstorm` | 头脑风暴 / 想法收敛 |
| `/ai-pm-review-modify` | 基于评审意见定向修改 PRD |
| `/tutorial-center-update` | 更新离线教程中心 |

核心独立技能：`/ai-pm-analyze`、`/ai-pm-research`、`/ai-pm-story`、`/ai-pm-prd`、`/ai-pm-prototype`、`/ai-pm-review`。

## 两版功能对比

| 能力 | Claude Code 版 | 桌面客户端 |
|------|:---:|:---:|
| 网页搜索和脚本执行 | 原生 | Claude CLI 模式 / 本地命令 |
| PM agent 和 sub-agent 工作流 | 原生 | 使用 bundled skills 和阶段编排 |
| 项目 Dashboard | - | 支持 |
| 分阶段可视化流程 | - | 支持 |
| PRD 评分 / 对比 / 助手 | 文件态 | 支持 |
| 功能广场 | skills / scripts | 支持 |
| 用户故事拖拽编辑 | - | 支持 |
| 原型设备模拟 | - | 支持 |
| 离线教程 | HTML 文件 | HTML 文件 |

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19、TypeScript 5、Vite 6、TailwindCSS 4、Mermaid 11 |
| 后端 | Tauri 2、Rust、SQLite |
| AI 技能 | 26 个 Claude Code 项目技能 + 2 个 sub-agent（pm-agent / prototype-agent）|
| 客户端资源 | 26 个 bundled app skills + 功能广场 manifest（5 大分类）|
| 导出脚本 | Python 3、Node 脚本、Chrome PDF 渲染 |
| AI 协作上下文 | `.ai-shared` 索引和 `scripts/ai-sync` 检查脚本 |
| CI/CD | GitHub Actions、macOS 通用二进制、Windows x64 |

## 项目结构

```text
.claude/skills/                    # 26 个 Claude Code 项目技能
.claude/agents/                    # 2 个 sub-agent：pm-agent（PRD 守门）、prototype-agent（原型审计）
.ai-shared/                        # Claude / Codex 共享 memory、skill、agent 索引
scripts/ai-sync/                   # 索引生成和上下文漂移检查
app/src/                           # React 前端
app/src/pages/project/             # 10 个项目阶段页面
app/src/pages/tools/plaza/         # 功能广场页面
app/src-tauri/                     # Rust 后端
app/src-tauri/resources/skills/    # 26 个桌面端 bundled skills
app/src-tauri/resources/plaza-manifest.json
templates/                         # PRD 风格、UI 规范、知识库、预设配置
docs/                              # 设计规范、实施记录
output/                            # 项目输出，不纳入版本库
AI_PM_教程中心.html                 # 离线交互式教程
```

## 使用教程

打开项目根目录的 `AI_PM_教程中心.html`，浏览器直接打开即可，离线可用，覆盖 Claude Code 版和桌面客户端。

## 许可证

[MIT](LICENSE)
