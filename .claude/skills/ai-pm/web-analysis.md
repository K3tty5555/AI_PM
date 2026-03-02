# Phase 0: 参考网页分析

## 触发条件

**方式1：直接输入 URL（单个网页）**
```bash
/ai-pm https://example.com/app           # 公开页面
/ai-pm https://example.com/login         # 需登录页面（会询问账号密码）
/ai-pm fetch                             # 手动触发重新抓取
```

**方式2：使用参考资源配置文件（多个网页+图片）**
```
用户提前准备：
output/projects/项目名/07-references/
├── reference-config.md    # 包含多个URL、账号密码、说明
├── session-auth.json      # 保存的登录会话（自动生成）
└── images/
    ├── homepage.png       # 首页截图
    ├── dashboard.png      # 仪表盘截图
    └── workflow.gif       # 操作流程动图

然后在CLI执行：
/ai-pm fetch
```

**技术说明：**
- 使用 `playwright-cli` 进行浏览器自动化
- 支持动态渲染页面（JavaScript 执行后内容）
- 支持保存/恢复登录会话，避免重复输入账密
- 获取页面快照（结构化元素列表）而非原始 HTML

## 参考资源配置文件

**模板位置**：`templates/configs/reference-config.md`

**文件结构**：
```markdown
# 参考资源配置

## 参考网页列表

### 资源 1：主系统
| 项目 | 内容 |
|------|------|
| **名称** | 公司现有后台系统 |
| **URL** | https://example.com/admin |
| **类型** | 现有系统迭代 |
| **账号** | admin |
| **密码** | 123456 |
| **说明** | 核心功能参考 |

### 资源 2：竞品的移动端
| 项目 | 内容 |
|------|------|
| **名称** | 竞品App |
| **URL** | https://m.example.com |
| **类型** | 竞品对标 |
| **账号** | user |
| **密码** | ****** |
| **说明** | 移动端交互参考 |

## 参考图片

| 文件名 | 说明 |
|--------|------|
| homepage.png | 首页布局参考 |
| workflow.gif | 关键操作流程 |

## 补充说明

### 当前系统的主要问题
1. 页面加载慢
2. 界面老旧
...

### 分析重点
- [x] 页面加载性能优化
- [x] 交互流程简化
```

**使用流程**：

```
AI: 📁 发现参考资源配置文件

    检测到以下内容：

    📄 reference-config.md
       • 主系统: https://example.com/admin (需登录)
       • 竞品移动端: https://m.example.com (需登录)

    🖼️ 参考图片 (3张)
       • homepage.png - 首页布局
       • dashboard.png - 仪表盘设计
       • workflow.gif - 操作流程

    💾 已保存会话: session-auth.json (可复用)

💬 请确认：
    1. 开始分析所有参考资源
    2. 只分析部分资源（请告诉我）
    3. 修改配置文件

你: 1

AI: 🔍 开始分析参考资源...
    使用 playwright-cli 打开浏览器...

    [1/2] 正在分析: https://example.com/admin
       $ playwright-cli open https://example.com/admin
       $ playwright-cli snapshot
       🔐 检测到登录页，使用保存的会话...
       $ playwright-cli state-load session-auth.json
       $ playwright-cli snapshot --filename=admin.yml
       $ playwright-cli screenshot --filename=admin.png
       ✅ 已获取页面结构和截图

    [2/2] 正在分析: https://m.example.com
       $ playwright-cli goto https://m.example.com
       $ playwright-cli snapshot --filename=mobile.yml
       $ playwright-cli screenshot --filename=mobile.png
       ✅ 已获取页面结构和截图

    ✓ 已读取 3 张参考图片

    📊 生成综合分析报告...
```

## 分析流程（使用 playwright-cli）

**流程1：直接输入URL**
```
用户输入URL
    ↓
检测网页类型（公开/需登录）
    ↓
如需要登录 → 询问账号密码
    ↓
确认操作权限（仅查看 / 自由操作 / 无限制）
    ↓
使用 playwright-cli 打开浏览器并访问URL
    ↓
根据权限模式操作网页
    ↓
获取页面快照和截图
    ↓
分析页面结构和功能
    ↓
生成参考网页分析报告
    ↓
询问用户意图（迭代/对标/参考）
```

**流程2：使用配置文件**
```
用户执行 /ai-pm fetch
    ↓
检测 07-references/reference-config.md
    ↓
读取所有URL和账号密码
    ↓
逐个确认操作权限（仅查看 / 自由操作 / 无限制）
    ↓
读取 images/ 文件夹图片
    ↓
使用 playwright-cli 批量抓取网页
    ↓
保存会话状态以便后续复用
    ↓
综合分析（网页+图片+文字说明）
    ↓
生成综合参考分析报告
    ↓
询问用户意图（迭代/对标/参考）
```

## 询问账号密码的交互

```
🔐 检测到该页面可能需要登录

💬 请提供访问凭证（信息仅用于本次分析，不会保存）：

1. 账号/用户名：__________
2. 密码：__________

或选择：
   • "跳过登录，分析公开部分" → 只抓取公开可见内容
   • "取消" → 退出网页分析，进入正常流程
```

## 操作权限确认（重要）

用户提供账密后，必须确认操作权限：

```
✅ 凭证已接收

⚠️ 重要确认：登录后，我的操作权限是？

1. 【仅查看】📖 只浏览页面内容、样式、结构
   → 我只会查看，不做任何点击/提交/修改操作
   → 适合：生产环境、真实数据、敏感系统

2. 【自由操作】🔀 可点击按钮、填写表单、体验交互流程
   → 我会深入体验交互细节，但不执行删除/提交类操作
   → 适合：测试环境、演示数据、允许探索的系统

3. 【无限制】⚠️ 可执行任何操作（包括删除、提交、保存）
   → 我会完整体验所有功能流程，包括写入操作
   → 适合：纯测试环境、可重置的演示系统、沙箱环境
   → ⚠️ 警告：此模式可能修改或删除数据，请确保环境可恢复

💡 建议：如果不确定，请选择【仅查看】模式

请回复：1 / 2 / 3
```

**权限模式说明：**

| 模式 | 可执行 | 不可执行 | 适用场景 |
|------|--------|----------|----------|
| **仅查看** | 页面截图、元素识别、结构分析 | 任何点击、表单填写、按钮触发 | 生产环境、真实业务数据 |
| **自由操作** | 点击导航、展开菜单、体验交互流程、填写非提交表单 | 删除操作、提交表单、保存修改、支付类操作 | 测试环境、演示账号、沙箱系统 |
| **无限制** | 所有操作，包括删除、提交、保存、修改数据 | 无限制 | 纯测试环境、可重置的演示系统 |

**安全原则：**
- 【自由操作】模式下，绝不执行删除、提交、保存等写入操作
- 【无限制】模式仅在用户明确选择且确认环境可恢复时使用
- 选择【无限制】前，系统会再次确认："确定要启用无限制模式吗？此操作可能修改或删除数据。"
- 优先选择对数据零影响的方式体验交互

## playwright-cli 使用指南

**基本流程：**

```bash
# 1. 打开浏览器并访问目标页面
playwright-cli open https://example.com

# 2. 获取页面快照（显示可交互元素）
playwright-cli snapshot

# 3. 如需登录，填写表单
playwright-cli fill e1 "username"
playwright-cli fill e2 "password"
playwright-cli click e3

# 4. 等待页面加载后再次获取快照
playwright-cli snapshot

# 5. 根据权限模式探索页面
# 【仅查看模式】- 仅获取快照和截图
playwright-cli screenshot --filename=page.png

# 【自由操作模式】- 可以点击查看不同页面
playwright-cli click e5
playwright-cli snapshot

# 6. 多标签页管理（分析多个页面）
playwright-cli tab-new https://example.com/page2
playwright-cli tab-list
playwright-cli tab-select 0

# 7. 保存会话状态（供后续复用）
playwright-cli state-save ./07-references/session-auth.json

# 8. 关闭浏览器
playwright-cli close
```

**批量分析多个URL：**

```bash
# 使用命名会话，保持登录状态
playwright-cli -s=reference-session open --persistent

# 逐个访问并分析
playwright-cli -s=reference-session goto https://example.com/page1
playwright-cli -s=reference-session snapshot --filename=page1.yml

playwright-cli -s=reference-session goto https://example.com/page2
playwright-cli -s=reference-session snapshot --filename=page2.yml

# 保存会话供后续使用
playwright-cli -s=reference-session state-save ./07-references/session.json
playwright-cli -s=reference-session close
```

**复用已保存的会话：**

```bash
# 下次分析时直接加载会话（免登录）
playwright-cli -s=reference-session open --persistent
playwright-cli -s=reference-session state-load ./07-references/session.json
playwright-cli -s=reference-session snapshot
```

**交互式分析示例：**

```
AI: 🔍 开始分析参考网页...

步骤 1/3: 打开浏览器并访问
$ playwright-cli open https://www.zhixue.com/admin
✅ 浏览器已打开，页面已加载

步骤 2/3: 获取页面快照
$ playwright-cli snapshot
✅ 已获取页面结构

检测到登录表单：
  - e1: 用户名输入框
  - e2: 密码输入框
  - e3: 登录按钮

步骤 3/3: 执行登录
$ playwright-cli fill e1 "tyshuxue01"
$ playwright-cli fill e2 "xjlgchy18!"
$ playwright-cli click e3
$ playwright-cli snapshot --filename=after-login.yml
✅ 登录成功，已获取登录后页面

📸 正在截图...
$ playwright-cli screenshot --filename=dashboard.png
✅ 截图已保存

💾 保存会话状态供后续使用...
$ playwright-cli state-save ./07-references/zhixue-session.json
✅ 会话已保存

🔍 页面分析中...
   • 识别页面结构... ✅
   • 提取功能清单... ✅
   • 分析交互流程... ✅
```

## 网页分析报告结构

**多资源综合分析**

```markdown
# 参考资源综合分析报告

## 分析概览
- 分析时间: {时间戳}
- 参考资源数: 3 个网页 + 5 张图片

## 资源 1：主系统（现有系统迭代）

### 基本信息
- URL: https://example.com/admin
- 类型: 现有系统迭代
- 账号: 已提供

### 页面结构分析
| 页面名称 | 功能描述 | 核心交互 |
|---------|---------|---------|
| 首页/仪表盘 | ... | ... |
| 列表页 | ... | ... |

### 功能清单
| 功能模块 | 功能点 | 优先级 | 备注 |
|---------|--------|--------|------|
| 用户管理 | 增删改查 | P0 | ... |

### 问题与痛点（迭代优化场景）
- 页面加载慢（>3秒）
- 界面设计老旧
- ...

## 资源 2：竞品移动端（竞品对标）

### 基本信息
- URL: https://m.example.com
- 类型: 竞品对标

### 亮点分析（对标开发场景）
- 交互流畅
- 视觉设计优秀
- ...

## 综合分析结论

### 产品定位
- 现有系统：企业内部管理工具
- 竞品：面向个人用户的产品

### 核心差异点
- 目标用户不同
- 功能复杂度不同
- ...

### 设计建议
1. 参考资源1的信息架构
2. 参考资源2的交互细节
3. 图片展示的视觉风格
```

## 用户意图确认

分析完成后询问：

```
📊 参考网页分析完成

💬 请告诉我你的意图：

1. **迭代优化**（现有系统升级）
   → 我会重点分析现有功能的改进点
   → 输出迭代版PRD

2. **对标开发**（竞品参考）
   → 我会分析竞品的差异化机会
   → 输出对标版PRD

3. **仅作参考**（普通竞品研究）
   → 作为Phase 3竞品研究的参考资料
   → 继续正常流程

请回复：迭代/对标/参考
```

---

**关联文件**：
- [SKILL.md](./SKILL.md) - 主技能入口
- [phase-workflows.md](./phase-workflows.md) - 阶段执行流程
- [user-interaction.md](./user-interaction.md) - 用户交互模式
- [edge-cases.md](./edge-cases.md) - 边缘情况处理
