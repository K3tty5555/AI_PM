# AI_PM 版本更新日志

> 记录 AI_PM 的所有版本更新，方便用户了解新功能和改进

---

## 📌 最新版本

### v1.1.0 (2026-02-28)

**新增功能**

| 功能 | 说明 | 使用方式 |
|------|------|----------|
| 🔗 **参考网页分析** | 支持通过 URL 抓取现有系统或竞品网页进行分析 | `/ai-pm https://example.com/app` |
| 🔐 **账号密码支持** | 分析需登录的页面时可提供凭证 | 自动提示输入 |
| 🔄 **迭代优化模式** | 针对现有系统的升级优化流程 | 分析后选择「迭代优化」 |
| 🎯 **对标开发模式** | 针对竞品的差异化开发流程 | 分析后选择「对标开发」 |
| 📄 **网页分析报告** | 自动生成 `00-reference-analysis.md` | 自动产出 |
| 📁 **参考资源配置文件** | 支持配置多个URL、账号密码、上传参考图片 | `07-references/reference-config.md` |

**改进优化**

- ✅ **操作权限分级**：新增「仅查看 / 自由操作 / 无限制」三种模式，保护用户数据安全

**文件变更**

```
AI_PM/
├── README.md                     # 优化：增加参考资源配置说明
├── AI_PM_新手教程.html           # 新增：可视化新手教程（Apple 规范）
├── CHANGELOG.md                  # 优化：更新版本日志
├── templates/                    # 新增：模板文件夹
│   └── 01-config/                # 新增：配置模板
│       └── reference-config.md   #     参考资源配置模板
└── .claude/skills/ai-pm/
    └── SKILL.md                  # 优化：增加参考资源配置机制
```

**目录结构更新**

```
projects/项目名/
├── 00-reference-analysis.md
├── 01-requirement-draft.md
├── 02-analysis-report.md
├── 03-competitor-report.md
├── 04-user-stories.md
├── 05-PRD-v1.0.md
├── 06-prototype/
└── 07-references/            # 新增：参考资源文件夹
    ├── reference-config.md   # 多个URL、账号密码配置
    └── images/               # 参考图片
        ├── screenshot-1.png
        └── workflow.gif
```

**使用示例**

```bash
# 分析公开页面
/ai-pm https://example.com/product

# 分析需登录页面（会提示输入账号密码）
/ai-pm https://company-intranet.com/system

# 重新抓取当前项目的参考网页
/ai-pm fetch

# 使用配置文件批量分析（支持多个URL+图片）
# 1. 准备 07-references/reference-config.md
# 2. 放入参考图片到 07-references/images/
# 3. 执行
/ai-pm fetch
```

---

## 🗂️ 历史版本

### v1.0.0 (2026-02-27)

**核心功能发布**

| 功能 | 说明 |
|------|------|
| 💬 **需求澄清** | 交互式深度访谈，澄清需求细节 |
| 🔍 **需求分析** | 输出结构化需求分析报告 |
| 📊 **竞品研究** | 分析市场竞争格局 |
| 👤 **用户故事** | 编写详细用户故事和验收标准 |
| 📝 **PRD 生成** | 输出专业级产品需求文档 |
| 🎨 **原型生成** | 生成交互式网页原型（HTML/CSS/JS） |
| 📁 **多项目管理** | 每个需求独立项目文件夹 |

**工作流程**

```
Phase 1: 需求澄清 → 01-requirement-draft.md
Phase 2: 需求分析 → 02-analysis-report.md
Phase 3: 竞品研究 → 03-competitor-report.md
Phase 4: 用户故事 → 04-user-stories.md
Phase 5: PRD 生成 → 05-PRD-v1.0.md
Phase 6: 原型生成 → 06-prototype/
```

**命令支持**

```bash
/ai-pm "需求描述"          # 创建新项目
/ai-pm                     # 继续当前项目
/ai-pm list                # 列出所有项目
/ai-pm status              # 查看当前项目状态
/ai-pm switch {项目名}     # 切换项目
/ai-pm analyze             # 仅执行需求分析
/ai-pm research            # 仅执行竞品研究
/ai-pm story               # 仅执行用户故事
/ai-pm prd                 # 仅生成 PRD
/ai-pm prototype           # 仅生成原型
```

**初始目录结构**

```
AI_PM/
├── .claude/skills/
│   ├── ai-pm/              # 主控技能
│   ├── ai-pm-analyze/      # 需求分析技能
│   ├── ai-pm-research/     # 竞品研究技能
│   ├── ai-pm-story/        # 用户故事技能
│   ├── ai-pm-prd/          # PRD 生成技能
│   └── ai-pm-prototype/    # 原型生成技能
├── output/
│   ├── projects/           # 所有项目
│   └── .current-project    # 记录当前项目
├── README.md
└── QUICKSTART.md
```

---

## 🔄 升级指南

### 从 v1.0.0 升级到 v1.1.0

**步骤 1：更新核心文件**

```bash
# 备份原有文件
cp AI_PM/README.md AI_PM/README.md.bak
cp AI_PM/QUICKSTART.md AI_PM/QUICKSTART.md.bak

# 更新 SKILL.md（关键，包含新功能逻辑）
# 确保 .claude/skills/ai-pm/SKILL.md 包含 Phase 0 相关内容
```

**步骤 2：添加新文档**

```bash
# 创建 TUTORIAL.md（详细教程）
# 创建 CHANGELOG.md（版本日志）
```

**步骤 3：验证**

```bash
/ai-pm list          # 验证基础功能
/ai-pm https://...   # 验证参考网页分析功能
```

---

## 📋 功能对比表

| 功能 | v1.0.0 | v1.1.0 |
|------|--------|--------|
| 需求澄清 | ✅ | ✅ |
| 需求分析 | ✅ | ✅ |
| 竞品研究 | ✅ | ✅ |
| 用户故事 | ✅ | ✅ |
| PRD 生成 | ✅ | ✅ |
| 原型生成 | ✅ | ✅ |
| 多项目管理 | ✅ | ✅ |
| **参考网页分析** | ❌ | ✅ 新增 |
| **账号密码支持** | ❌ | ✅ 新增 |
| **迭代优化模式** | ❌ | ✅ 新增 |
| **对标开发模式** | ❌ | ✅ 新增 |
| **完整新手教程** | ❌ | ✅ 新增 |
| **版本更新日志** | ❌ | ✅ 新增 |
| **参考资源配置文件** | ❌ | ✅ 新增 |
| **批量分析多个网页** | ❌ | ✅ 新增 |
| **参考图片上传分析** | ❌ | ✅ 新增 |
| **可视化 HTML 教程** | ❌ | ✅ 新增 |

---

## 🚧 即将推出

### v1.2.0 (计划中)

- [ ] 支持导出为 PDF 格式 PRD
- [ ] 支持自定义 prompt 模板
- [ ] 支持团队协作（多人编辑项目）
- [ ] 支持多语言（英文）
- [ ] 支持 AI 自动搜索竞品信息

### v2.0.0 (远期规划)

- [ ] 支持直接生成 React/Vue 代码
- [ ] 支持接入真实数据库
- [ ] 支持 API 文档自动生成
- [ ] 支持产品数据看板

---

## 📝 更新说明

### 记录范围

CHANGELOG 仅记录**功能性更新**，以下内容不记录：
- 文案、注释的细微调整
- 样式、排版的优化
- 代码重构（无功能变化）
- 文档格式调整

### 版本号规则

- **主版本号 (v1.x.x)**：重大架构变更或不兼容更新
- **次版本号 (vx.1.x)**：新功能发布
- **修订号 (vx.x.1)**：Bug 修复和优化

### 如何获取更新

1. 关注 GitHub Releases（如果使用 Git 管理）
2. 查看 CHANGELOG.md 文件
3. 执行 `/ai-pm status` 查看当前版本信息

---

## 💡 反馈与建议

如果你有任何建议或发现了 Bug，欢迎：
- 在 GitHub 上提交 Issue
- 直接告诉 Claude 你的反馈

---

**当前版本：v1.1.0**
**最后更新：2026-02-28**
