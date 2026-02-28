# AI_PM - AI 产品经理

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
| ✍️ **风格管理** | 分析用户的 PRD 风格，生成风格配置文件，支持多种风格管理 |
| 🎨 **原型生成** | 生成交互式网页原型（HTML+CSS+JS） |
| 🔗 **参考网页分析** | 抓取现有系统或竞品网页，支持账号密码登录 |
| 📁 **多项目管理** | 每个需求独立项目文件夹，避免混乱 |

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
│   └── ai-pm-prototype/      # 原型生成
│
├── output/                   # 产出目录
│   ├── projects/             # 所有项目
│   │   ├── project-a-20260228/
│   │   │   ├── 00-reference-analysis.md  # 参考网页分析（可选）
│   │   │   ├── 01-requirement-draft.md   # 需求澄清
│   │   │   ├── 02-analysis-report.md     # 需求分析
│   │   │   ├── 03-competitor-report.md   # 竞品研究
│   │   │   ├── 04-user-stories.md        # 用户故事
│   │   │   ├── 05-PRD-v1.0.md            # PRD文档
│   │   │   ├── 06-prototype/             # 网页原型
│   │   │   └── 07-references/            # 参考资源（可选）
│   │   │       ├── reference-config.md   # 参考资源配置
│   │   │       └── images/               # 参考图片
│   │   └── project-b-20260301/
│   └── .current-project      # 记录当前项目
│
└── templates/                # 全局模板（跨项目共享）
    ├── 00-examples/          # 示例文件
    ├── 01-config/            # 配置模板
    │   └── reference-config.md  # 参考资源配置模板
    ├── design-systems/       # ✅ 设计规范库（全局独立管理）
    │   ├── README.md
    │   ├── enterprise-standard/
    │   └── [用户自定义规范]/
    ├── pm-styles/            # ✅ 产品经理风格库（全局独立管理）
    │   ├── README.md
    │   ├── default/
    │   └── [用户自定义风格]/
    ├── prd-templates/        # PRD模板
    └── ...
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
| `/ai-pm prd` | 仅生成 PRD |
| `/ai-pm style` | 管理产品经理风格 |
| `/ai-pm style analyze {文件}` | 分析 PRD 创建风格 |
| `/ai-pm https://...` | 分析参考网页 |

---

## 📚 详细文档

- **[AI_PM_新手教程.html](./AI_PM_新手教程.html)** - 可视化新手教程（推荐）
- **[CHANGELOG.md](./CHANGELOG.md)** - 版本更新日志

---

## 🎯 工作流程

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
Phase 6: 原型生成（可选）
    ↓ 保存 06-prototype/
✅ 完成
```

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

---

## 🔧 自定义

- 修改 `.claude/skills/ai-pm-analyze/SKILL.md` 自定义分析框架
- 修改 `.claude/skills/ai-pm-prd/SKILL.md` 自定义 PRD 模板
- 所有 skill 都是 Markdown 文件，可直接编辑

---

## 📝 License

MIT

---

**遇到问题？** 打开 [AI_PM_新手教程.html](./AI_PM_新手教程.html) 查看详细教程
