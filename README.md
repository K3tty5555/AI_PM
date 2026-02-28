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
| ✍️ **写作风格** | 分析你的 PRD 写作风格（章节结构、用词习惯），生成风格配置 |
| 🎨 **原型生成** | 生成交互式网页原型（HTML+CSS+JS） |
| 🔗 **参考网页分析** | 抓取现有系统或竞品网页，支持账号密码登录 |
| 👥 **需求评审** | 八大角色（研发/架构/产品/设计/项目/QA/安全/运营）专业评审 |
| 🔄 **多轮迭代** | 基于评审意见多次修改，直到方案成熟 |
| ⚡ **快速模式** | 15分钟快速输出，支持4种工作流模式 |
| 👤 **用户分层** | 新手/专业/专家模式，个性化体验 |
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
│   ├── ai-pm-prototype/      # 原型生成
│   └── ai-pm-review/         # 需求评审（新增）
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
│   │   │   ├── 07-references/            # 参考资源（可选）
│   │   │   │   ├── reference-config.md   # 参考资源配置
│   │   │   │   └── images/               # 参考图片
│   │   │   └── 08-review-report-v1.md    # 需求评审报告（可选）
│   │   └── project-b-20260301/
│   └── .current-project      # 记录当前项目
│
└── templates/                # 全局模板（跨项目共享）
    ├── 00-examples/          # 示例文件
    ├── 01-config/            # 配置模板
    │   └── reference-config.md  # 参考资源配置模板
    ├── ui-specs/               # ✅ UI 规范库（颜色、字体、组件）
    │   ├── README.md
    │   ├── example-enterprise/
    │   └── [用户自定义规范]/
    ├── writing-styles/       # ✅ PRD 写作风格库（章节结构、用词习惯）
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
| `/ai-pm review` | 需求评审（八大角色） |
| `/ai-pm prd` | 仅生成 PRD |
| `/ai-pm writing-style` | 管理 PRD 写作风格 |
| `/ai-pm writing-style analyze {文件}` | 分析 PRD 写作风格 |
| `/ai-pm ui-spec` | 管理 UI 设计规范 |
| `/ai-pm ui-spec upload {名称}` | 上传并解析 UI 规范 |
| `/ai-pm https://...` | 分析参考网页 |

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
Phase 6: 原型生成（可选）
    ↓ 保存 06-prototype/
Phase 7: 需求评审（可选，支持多轮）
    ↓ 保存 08-review-report-v1.md
    ↓ 修改后 → 05-PRD-v1.1.md
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
| 📊 **标准模式** | Phase 1-6 | 45分钟 | 常规项目（推荐） |
| 🔬 **深度模式** | Phase 0-7 + 多轮评审 | 2小时 | 复杂系统、企业项目 |
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

**示例6：快速模式（v1.4新增）**
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

## 🔧 自定义

- 修改 `.claude/skills/ai-pm-analyze/SKILL.md` 自定义分析框架
- 修改 `.claude/skills/ai-pm-prd/SKILL.md` 自定义 PRD 模板
- 所有 skill 都是 Markdown 文件，可直接编辑

---

## 📝 License

MIT

---

**遇到问题？** 打开 [AI_PM_教程中心.html](./AI_PM_教程中心.html) 查看详细教程
