# AI_PM 快速上手指南

> 5 分钟上手 AI_PM，从需求到 PRD + 可交互原型

---

## 🚀 5 分钟快速开始

### 第 1 步：安装（1 分钟）

```bash
# 确保 AI_PM 文件夹在你的项目根目录
ls -la AI_PM/.claude/skills/ai-pm/
# 应该有 SKILL.md 文件
```

### 第 2 步：启动（1 分钟）

```bash
cd /path/to/your/project
claude
```

### 第 3 步：创建项目（2 分钟）

```
/ai-pm "我想做一个记账小程序，帮助年轻人管理日常开支"
```

### 第 4 步：跟随引导（持续）

AI 会问你几个问题，回答完就能获得完整 PRD 和原型。

---

## 📖 目录

1. [从零开始（最常用）](#1-从零开始最常用)
2. [基于现有系统迭代](#2-基于现有系统迭代)
3. [基于竞品对标](#3-基于竞品对标)
4. [生成交互原型](#4-生成交互原型)
5. [项目管理](#5-项目管理)
6. [常用命令速查](#6-常用命令速查)
7. [故障排除](#7-故障排除)

---

## 1. 从零开始（最常用）

### 适用场景

- 我有一个产品想法
- 要从零设计一个功能
- 需要完整的 PRD 文档

### 使用方法

```
/ai-pm "你的需求描述"
```

### 示例

**示例 1：简单需求**
```
/ai-pm "做一个番茄钟 App，帮助用户专注工作"
```

**示例 2：复杂需求**
```
/ai-pm "开发一个智能客服系统，能自动回复常见问题，
支持多渠道接入（微信、网页、APP），并且可以转接人工客服"
```

### 交互流程

```
你: /ai-pm 我想做一个帮助大学生管理课程表的 App

AI: 👋 你好，我是你的 AI 产品经理。

    📁 创建新项目

    项目命名建议：
    - course-schedule-20260301（自动生成）
    - 或你想指定一个项目名？

你: 就叫 course-app 吧

AI: ✅ 创建项目: course-app
    路径: ai-pm/output/projects/course-app/

    收到你的初步需求："我想做一个帮助大学生管理课程表的 App"

    第一个问题：这个 App 主要是给谁用的？
    是大学生？还是高中生？

你: 给大学生，特别是课多、还要参加社团活动的学生

AI: 明白了！针对课多、活动多的大学生。

    第二个问题：他们现在怎么管理课程？
    是用纸质课表？还是手机日历？

...（继续问答，约 5-10 分钟）
```

### 产出文件

```
ai-pm/output/projects/course-app/
├── 01-requirement-draft.md      # 需求澄清
├── 02-analysis-report.md        # 需求分析
├── 03-competitor-report.md      # 竞品研究
├── 04-user-stories.md           # 用户故事
├── 05-PRD-v1.0.md               # PRD 文档
└── 06-prototype/                # 网页原型（可选）
    ├── index.html
    ├── css/
    ├── js/
    └── pages/
```

---

## 2. 基于现有系统迭代

### 适用场景

- 公司内部系统太老，需要翻新
- 现有产品体验差，需要优化
- 要做 2.0 版本升级

### 使用方法

**方式 1：直接输入 URL（适合单个网页）**
```
/ai-pm https://your-company.com/existing-system
```

**方式 2：使用参考资源配置文件（适合多个网页+图片）**

当需要参考多个系统或竞品时，推荐使用配置文件方式：

**步骤 1：准备配置文件**

在项目内创建 `07-references/reference-config.md`：

```bash
mkdir -p ai-pm/output/projects/你的项目/07-references/images
cp ai-pm/templates/reference-config.md ai-pm/output/projects/你的项目/07-references/
```

**步骤 2：填写配置信息**

编辑 `reference-config.md`，填写：
- 多个参考网页的 URL
- 账号密码（如需要登录）
- 每个资源的说明和类型（迭代/对标）

**步骤 3：添加参考图片**

将截图放入 `images/` 文件夹：
```
07-references/
├── reference-config.md
└── images/
    ├── homepage.png       # 首页布局参考
    ├── dashboard.png      # 仪表盘设计
    └── workflow.gif       # 操作流程演示
```

**步骤 4：执行分析**
```
/ai-pm fetch
```

AI 会自动读取配置文件，批量抓取所有网页，分析图片，生成综合报告。

### 交互流程（直接输入 URL）

```
你: /ai-pm https://company-intranet.com/hr-system

AI: 🔐 检测到该页面可能需要登录

💬 请提供访问凭证（信息仅用于本次分析，不会保存）：

1. 账号/用户名：zhangsan
2. 密码：******

或选择：
   • "跳过登录" → 只抓取公开可见内容
   • "取消" → 进入正常流程

你: （输入账号密码）

AI: 🔍 正在分析网页...
    ✓ 已抓取 5 个主要页面
    ✓ 已识别 12 个核心功能

📊 参考网页分析完成

    页面结构：
    • 员工列表、考勤管理、请假审批、薪资查询

    核心功能：
    • 打卡签到、请假申请、审批流程、薪资查看...

💬 请告诉我你的意图：

1. 迭代优化（现有系统升级）←
2. 对标开发（竞品参考）
3. 仅作参考（普通竞品研究）

你: 1

AI: ✅ 进入迭代优化模式

    后续访谈将重点了解：
    • 现在哪里不好用？
    • 你最想改什么功能？
    • 用户反馈最多的问题是什么？

    第一个问题——现在的系统最大的问题是什么？

你: 页面加载太慢，考勤打卡经常卡住，界面像 20 年前的

...（继续问答）
```

### 迭代版 PRD 特点

- **现状问题清单**：现有系统的具体问题
- **优化建议列表**：针对性的改进方案
- **迭代路线图**：分阶段实施计划
- **新旧对比**：功能对照表

---

## 3. 基于竞品对标

### 适用场景

- 要做一款类似竞品但更好的产品
- 研究竞品的差异化机会
- 了解行业标杆的做法

### 使用方法

```
/ai-pm https://competitor.com/product
```

### 交互流程

```
你: /ai-pm https://www.notion.so

AI: 🔍 正在分析网页...

📊 参考网页分析完成

💬 请告诉我你的意图：

1. 迭代优化
2. 对标开发（竞品参考）←
3. 仅作参考

你: 2

AI: ✅ 进入对标开发模式

    后续访谈将重点了解：
    • 我们要比他们强在哪？
    • 用户为什么选择我们？
    • 有哪些功能我们必须追赶？

    第一个问题——Notion 的功能很全面了，
    我们的产品要怎么差异化？

你: 我们只做国内市场，要深度集成微信和钉钉

...（继续问答）
```

### 对标版 PRD 特点

- **功能对比表**：我们和竞品的功能对照
- **差异化策略**：核心竞争优势
- **优先级划分**：必须有 / 差异化 / 创新功能
- **市场定位**：目标用户和使用场景

---

## 4. 生成交互原型

### 适用场景

- PRD 完成后，想看到产品界面
- 需要演示给团队/客户看
- 验证交互流程是否合理

### 使用方法

```
/ai-pm prototype
```

### 交互流程

```
你: /ai-pm prototype

AI: 🎨 即将开始：原型设计

💬 请告诉我设计偏好：

1. 设备类型：
   • 移动端 App（手机应用）
   • Web 端（电脑浏览器）
   • 响应式（同时适配）

2. 设计风格（可选，默认 Apple 风格）：
   • Apple 风格（简洁、圆角、毛玻璃）
   • Material Design
   • 自定义描述

你: 移动端，Apple 风格

AI: ✅ 原型生成完成！

    📁 文件位置：06-prototype/
    📄 入口文件：index.html

    🌐 预览方式：
       cd AI_PM/ai-pm/output/projects/course-app/06-prototype
       python -m http.server 8080
       访问 http://localhost:8080
```

### 预览原型

```bash
# 进入原型目录
cd AI_PM/ai-pm/output/projects/course-app/06-prototype

# 启动服务器
python3 -m http.server 8080

# 浏览器访问
http://localhost:8080
```

---

## 5. 项目管理

### 查看所有项目

```
/ai-pm list
```

输出：
```
📁 AI_PM 项目列表

▶ course-app-20260301 - 60% (当前项目)
  accounting-app-20260301 - 100%
  pomodoro-app-20260301 - 20%

共 3 个项目
```

### 查看项目状态

```
/ai-pm status
```

输出：
```
📊 AI_PM 项目状态

📁 项目: course-app-20260301
   路径: ai-pm/output/projects/course-app-20260301/

   ✅ 阶段 1: 需求澄清 (4.2KB, 02-28 10:30)
   ✅ 阶段 2: 需求分析 (12.5KB, 02-28 10:35)
   ✅ 阶段 3: 竞品研究 (15.8KB, 02-28 10:42)
   ⏳ 阶段 4: 用户故事
   ⏳ 阶段 5: PRD生成
   ⏳ 阶段 6: 原型生成

   进度: 50% (3/6)

🔄 继续命令:
   /ai-pm story    # 继续用户故事
```

### 切换项目

```
/ai-pm switch accounting-app-20260301
```

### 断点续传

如果中途退出，下次会自动继续：

```
/ai-pm

AI: 📊 检测到当前项目：course-app-20260301
    ✅ 阶段 1: 需求澄清
    ✅ 阶段 2: 需求分析
    ⏳ 阶段 3: 竞品研究（未完成）

    🔄 继续执行竞品研究...
```

---

## 6. 常用命令速查

### 项目管理

| 命令 | 作用 | 示例 |
|------|------|------|
| `/ai-pm list` | 列出所有项目 | - |
| `/ai-pm status` | 显示当前项目状态 | - |
| `/ai-pm switch {项目名}` | 切换到指定项目 | `/ai-pm switch course-app` |
| `/ai-pm new {项目名}` | 创建空项目 | `/ai-pm new my-project` |
| `/ai-pm delete {项目名}` | 删除项目 | `/ai-pm delete old-project` |

### 执行流程

| 命令 | 作用 | 示例 |
|------|------|------|
| `/ai-pm` | 继续当前项目 | `/ai-pm` |
| `/ai-pm "需求"` | 创建新项目 | `/ai-pm "做一个记账App"` |
| `/ai-pm analyze` | 仅执行需求分析 | `/ai-pm analyze` |
| `/ai-pm research` | 仅执行竞品研究 | `/ai-pm research` |
| `/ai-pm story` | 仅执行用户故事 | `/ai-pm story` |
| `/ai-pm prd` | 仅生成 PRD | `/ai-pm prd` |
| `/ai-pm prototype` | 仅生成原型 | `/ai-pm prototype` |

### 参考网页分析

| 命令 | 作用 | 示例 |
|------|------|------|
| `/ai-pm https://...` | 分析单个参考网页 | `/ai-pm https://example.com/app` |
| `/ai-pm fetch` | 读取配置文件批量分析 | `/ai-pm fetch` |

**说明**：
- `/ai-pm https://...` - 适合分析单个网页，会询问账号密码
- `/ai-pm fetch` - 读取 `07-references/reference-config.md` 批量分析多个网页和图片

### 从文件读取

| 命令 | 作用 | 示例 |
|------|------|------|
| `/ai-pm {文件路径}` | 从文件读取需求 | `/ai-pm ./docs/my-idea.md` |

---

## 7. 故障排除

### Q: 技能没有响应？

**检查 1：文件夹位置**
```bash
ls -la AI_PM/.claude/skills/ai-pm/
# 应该有 SKILL.md 文件
```

**检查 2：Claude Code 是否正常**
```bash
/help
# 应该显示 Claude Code 帮助信息
```

### Q: 想重新开始一个项目？

**方法 1：删除项目重新创建**
```bash
rm -rf AI_PM/ai-pm/output/projects/项目名
/ai-pm "新的需求描述"
```

**方法 2：清空项目文件保留项目**
```bash
rm AI_PM/ai-pm/output/projects/项目名/02-*.md
rm AI_PM/ai-pm/output/projects/项目名/03-*.md
# 然后继续执行
/ai-pm
```

### Q: 如何备份项目？

```bash
# 备份单个项目
cp -r AI_PM/ai-pm/output/projects/my-project ./backup/

# 备份所有项目
cp -r AI_PM/ai-pm/output/projects ./backup-all/
```

### Q: 如何修改已生成的文档？

```
/ai-pm analyze

AI: ⚠️ 需求分析报告已存在 (02-analysis-report.md)

    请选择：
    1. 重新生成（覆盖现有文件）
    2. 查看现有报告
    3. 取消

你: 1

AI: 🔄 重新执行需求分析...
```

---

## 📚 更多文档

- **[README.md](./README.md)** - 项目简介和快速开始
- **[TUTORIAL.md](./TUTORIAL.md)** - 完整新手教程（进阶）
- **[CHANGELOG.md](./CHANGELOG.md)** - 版本更新日志

---

## 💡 最佳实践

### 1. 需求描述技巧

**好的描述：**
```
/ai-pm "做一个帮助自由职业者管理项目的工具，
需要支持任务追踪、时间记录、客户管理和发票生成，
目标用户是设计师和独立开发者"
```

**不好的描述：**
```
/ai-pm "做一个项目管理工具"
```

### 2. 与 AI 对话技巧

- ✅ 回答具体，举例子
- ✅ 不清楚就说"让我想想"
- ✅ 随时可以打断说"等等，我觉得..."
- ❌ 不要说"随便做做"
- ❌ 不要说"你先做着看"

### 3. 多项目管理建议

```
/ai-pm "需求 A"     # 创建项目 A
/ai-pm switch A     # 切换到 A
/ai-pm              # 完成 A

/ai-pm "需求 B"     # 创建项目 B
/ai-pm switch B     # 切换到 B
/ai-pm              # 完成 B

/ai-pm list         # 查看所有项目
```

---

祝你使用愉快！有任何问题随时反馈 🚀
