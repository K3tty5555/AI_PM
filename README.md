# AI PM

AI 产品经理工具。输入需求，输出 PRD、原型、评审报告。

有两种使用方式，功能互补：

| | Claude Code 版 | 桌面客户端 |
|---|---|---|
| 形态 | Claude Code 内的技能集 | 独立桌面应用（macOS / Windows） |
| 交互 | 命令行对话 | GUI 可视化操作 |
| 前置条件 | [Claude Code](https://claude.ai/code) 订阅 | API Key 或本地 Claude CLI |
| 核心优势 | 工具链强：网页搜索、脚本执行、多 Agent 并行 | 体验好：进度可视化、拖拽排序、设备预览、暗色模式 |

## 能做什么

- **完整产品流程** — 需求分析 → 竞品研究 → 用户故事 → PRD → 原型 → 六角色评审，每阶段独立保存
- **PRD 多格式导出** — Markdown / PDF / DOCX（可导入飞书），一次生成全套
- **需求优先级评估** — 四维打分（业务价值/实现成本/用户影响/战略契合），输出排序和回复模板
- **工作周报** — 随意描述本周工作，输出向上汇报版或团队同步版
- **现场调研** — 结构化访谈 + 实时记录，现场生成 PRD
- **数据洞察** — 上传 Excel/CSV，挖掘业务洞察，生成交互式仪表盘
- **产品分身** — 学习你的 PRD 写作风格，让 AI 输出越来越像你
- **设计规范** — 加载公司 UI 规范，原型自动遵守设计标准
- **知识库** — 沉淀设计模式、决策记录、踩坑经验，自动推荐

## 快速开始

### 方式一：Claude Code 版

```bash
git clone https://github.com/K3tty5555/AI_PM.git
cd AI_PM
claude  # 打开 Claude Code
```

```
/ai-pm "我想做一个记账小程序，帮助年轻人管理日常开支"
```

AI 会引导你完成需求澄清，然后逐步推进到 PRD 和原型。

### 方式二：桌面客户端

从 [Releases](https://github.com/K3tty5555/AI_PM/releases) 下载安装包：
- macOS：`AI.PM_x.x.x_universal.dmg`
- Windows：`AI.PM_x.x.x_x64-setup.exe`

首次启动后在设置页面配置 AI 后端（三选一）：
- **Anthropic API** — 填写 API Key
- **OpenAI 兼容接口** — 填写 Base URL + Key（支持中转）
- **Claude CLI** — 复用本机已登录的 Claude Code，无需额外 Key

## Claude Code 版技能列表

| 命令 | 说明 |
|------|------|
| `/ai-pm [需求]` | 完整流程：需求 → PRD → 原型 → 评审 |
| `/ai-pm --team [需求]` | 复杂需求，多 Agent 并行协作 |
| `/ai-pm continue` | 恢复上次未完成的项目 |
| `/ai-pm priority` | 需求优先级评估 |
| `/ai-pm weekly` | 工作周报生成 |
| `/ai-pm interview` | 现场调研 / 客户访谈 |
| `/ai-pm data [文件]` | 数据洞察分析 |
| `/ai-pm persona` | 产品分身（风格学习） |
| `/ai-pm design-spec` | 设计规范管理 |
| `/ai-pm knowledge` | 产品知识库 |

独立技能：`/ai-pm-analyze`、`/ai-pm-research`、`/ai-pm-story`、`/ai-pm-prd`、`/ai-pm-prototype`、`/ai-pm-review`

## 桌面客户端功能

### 项目阶段（9 步）
需求收集 → 需求分析 → 竞品研究 → 用户故事 → PRD → 埋点设计 → 原型 → 评审 → 复盘

每个阶段支持「先聊聊」模式——先与 AI 多轮讨论，达成共识后再生成。

### 工具箱
需求优先级 · 工作周报 · 数据洞察 · 现场调研 · 知识库 · 产品分身 · 设计规范

### 客户端独有
- 项目 Dashboard（搜索/过滤/收藏/进度条）
- 用户故事拖拽排序（StoryBoard）
- PRD 目录导航 + Mermaid 实时渲染
- 原型设备模拟预览（Mobile / Tablet / Desktop）
- 六角色评审结果 Tab 切换
- CLI 增强模式：竞品研究自动搜索网页，原型生成支持多文件
- 分段渐现：内容按段落 fade-in 渐次呈现
- 生成进度：工具调用实时状态 + 费用显示
- 暗色模式 · 快捷键（⌘K / ⌘B / ⌘1-9）

## 两个版本的差异

| 能力 | Claude Code 版 | 客户端 |
|------|:---:|:---:|
| 网页搜索（竞品研究） | ✅ 原生 | ✅ CLI 模式 |
| 脚本执行（数据分析） | ✅ | ✅ CLI 模式 |
| 多 Agent 并行 | ✅ | 二期 |
| Playwright 网页分析 | ✅ | 需本地配置 |
| 可视化 Dashboard | ❌ | ✅ |
| 拖拽编辑 | ❌ | ✅ |
| 设备模拟预览 | ❌ | ✅ |
| 先聊聊（Brainstorm） | 天然对话 | ✅ 专属模式 |
| 离线使用 | 需在线 | API 模式需在线 |

## 使用教程

打开项目根目录的 `AI_PM_教程中心.html`（浏览器直接打开，无需网络），包含两个版本的完整使用指南。

## License

MIT
