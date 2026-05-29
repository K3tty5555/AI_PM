---
name: ai-pm-prototype
description: >-
  原型生成技能。基于 PRD 生成可交互的单页网页原型，支持移动端和 Web 端。
  首次生成时询问设计规范（公司规范 / AI 情境定制 / 主流组件库），项目内记住偏好。
  若项目存在 Codex 生成的视觉锚点包（06-prototype-visual/manifest.json），生成 HTML 前必须读取并遵循。
  当用户说「生成原型」「做原型」「可交互原型」「HTML原型」「页面原型」「低保真」「高保真原型」
  「画个界面」「把PRD做成原型」时，立即使用此技能。
  边界：本技能用于「把已有 PRD/需求做成可评审原型」；脱离 PRD 的纯视觉探索、通用 UI 组件生成或视觉精修，用 ui-ux-pro-max 或 impeccable。
argument-hint: "[PRD路径 | --mobile | --web | --visual | --visual-strict]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(node)
---

# 原型生成

本技能必须同时使用 `.claude/agents/prototype-agent.md` 和 `.claude/skills/ai-pm/references/prototype-judgment-card.md` 的质量标准。

**默认目标 = 可操作级**（判断卡 §1.1，三档里最高档，上面没有更高的）——原型要能像上线后一样**自由操作**：占位按钮做成真交互（不留死按钮）、认有限意图+澄清兜底（不硬解析任意输入）、不假全量重算（只重计数可见数字）、L2 人机确认是真检查点。只有明确是一次性概念稿/纯内部碰撞才**有意识地**降档到可评审级或示意级，并说明原因；不主动降。

**验证必带视觉核对**（判断卡 §11）——经用户允许跑浏览器时，每个关键状态（每道闸、每个异常态、每个产出件页面）都要 `browser_take_screenshot` 在目标视口下肉眼核对。DOM 断言（存在/计数/可见/类名/文本）只验逻辑，验不出溢出/折行/竖排/对齐等纯视觉 bug，**全绿也照样错**；没截图核对的状态在审计里如实标"仅 DOM 验证、未视觉核对"，不谎报"全过"。

## 输入

- 主要：`{项目目录}/05-prd/05-PRD-v1.0.md`（PRD）
- 可选：`templates/ui-specs/{规范名}/`（自定义设计规范）
- 可选：`{项目目录}/.ai-pm-config.json`（项目配置，含 designSystem 字段）
- 可选：`{项目目录}/06-prototype-visual/manifest.json`（Codex 生成的视觉锚点包）
- 可选：`{项目目录}/06-prototype-visual/visual-fingerprint.md`（视觉指纹）

## 输出

`{项目目录}/06-prototype/index.html`（单文件，可直接用浏览器打开）

## 执行步骤

### 步骤1：原型配置（一次性）

读取 `{项目目录}/.ai-pm-config.json`，检查 `designMode` 和 `deviceType` 字段：
- **两项都有** → 直接沿用，告知用户，跳至步骤2
- **缺少任一项** → 用 **AskUserQuestion 工具** 同时询问两个问题（缺哪问哪）

**问题一：设计规范**（若 `designMode` 已有则跳过）

先检查 `templates/ui-specs/.active-spec`，若已激活公司规范直接填入，否则询问：

| 选项 | 说明 |
|------|------|
| 公司/团队规范 | 应用已上传的 UI 规范；未上传将引导先上传 |
| AI 情境定制 | 分析产品场景后自主选择风格，确保有记忆点 |
| 主流组件库 | Ant Design / Material / Element Plus 等（追加询问具体选哪个） |

**问题二：设备类型**（若用户已说明或 `deviceType` 已有则跳过）

| 选项 | 说明 |
|------|------|
| 移动端 | 手机 App，375px 基准宽度 |
| Web 端 | 桌面浏览器，左侧 Sidebar 布局 |
| 响应式 | 同时适配手机和电脑 |
| 混合 | 各页面独立指定设备类型 |

两项结果写入 `{项目目录}/.ai-pm-config.json`，继续步骤2。

### 步骤1.5：视觉锚点包检查（如有）

检查 `{项目目录}/06-prototype-visual/manifest.json`：

- **`status=ready`** → 读取 `manifest.json`、`visual-fingerprint.md`、`audit.md`（如有），并把 `images[].image` 作为 HTML 原型视觉约束；继续步骤2
- **`status=partial`** → 读取 `visual-fingerprint.md` 和已生成图片；允许继续，但完成后的审计报告必须提示“视觉锚点包未完成”，并列出缺失页面；若 `request.json` 中 `gateMode=strict`，暂停并提示先切到 Codex 补齐
- **`status=failed`** → 降级为普通 HTML 原型，审计报告记录失败原因
- **不存在** → 普通原型继续；若用户明确选择“视觉锚定原型 / --visual-strict”，先写出 `06-prototype-visual/request.json` 后暂停，不直接调用生图

**读取要求**：
- `visual-fingerprint.md` 用于约束布局节奏、组件形态、页面密度、色彩气质和禁忌项
- `manifest.images[].image` 用于约束页面整体视觉和关键状态，但图片中文字不作为最终文案事实源
- HTML 原型仍必须可点击、可走主流程；视觉锚点图不能替代交互原型

### 步骤2：原型蓝图 + 视觉方向

生成 HTML 前先按 `prototype-agent` 的 Mode A 产出原型蓝图；Agent 工具不可用时，主对话按同一角色规则执行。

蓝图必须包括：
- 页面/视图清单：每页目的、关键操作、是否需要截图占位
- 主流程：用户从哪里开始，如何完成核心任务
- 信息层级：首屏重点、次级信息、操作区、反馈区
- 状态清单：默认、空、加载、错误、成功；Agent 产品另含 AI 思考、工具失败、结果预确认
- 视觉方向：布局密度、色彩气质、字体层级、组件风格、留白比例、数据呈现方式
- 生成硬约束：5-8 条可执行约束

视觉设计是原型质量的一部分：
- 有代码仓设计指纹时，优先复用其布局、色值、组件密度
- 有视觉锚点包且 `status=ready` 时，优先遵循视觉锚点包中的视觉指纹和图片约束
- 有用户选定设计规范时，按该规范生成
- AI 情境定制时，必须给出符合产品场景的视觉主张，不退回通用 SaaS 模板

### 步骤3：解析 PRD，提取页面信息

- 功能清单 → 确定需要哪些页面
- 页面流程图 → 确定页面跳转关系
- 详细功能设计 → 确定每个页面的元素和交互

### 步骤4：生成单文件 HTML 原型

所有 CSS 和 JS 内联到单个 `index.html`，无外部依赖，直接双击即可预览。

生成时必须遵循蓝图和以下底线：
- 不套通用模板，不用灰白卡片 + 蓝按钮糊弄
- 若存在 ready 状态视觉锚点包，不得偏离其布局节奏、组件比例、页面密度和业务骨架
- B 端不能做成营销页，C 端不能做成后台表格脸
- 核心按钮必须可点，点击后有状态变化
- 假数据必须贴近 PRD 业务，不使用"测试数据/示例内容/张三"这类占位内容
- 空、加载、错误、成功状态必须至少覆盖主流程
- Agent / hybrid 产品必须体现用户输入、AI 回复、AI 状态、结果预确认、用户修改入口、失败兜底

## 技术规范

### 三档设计规范应用规则

**① 公司/团队规范**
加载 `templates/ui-specs/{规范名}/design-tokens.json`，将其中颜色、字体、间距、圆角 Token 映射为 CSS variables 写入 `<style>` 标签。

**② AI 情境定制**
不预设 CSS variables。生成 HTML 前先分析产品情境：
- 行业属性（教育 / 金融 / 电商 / 工具…）
- 用户群体（学生 / 教师 / 消费者 / 企业用户…）
- 产品类型（移动端 App / B 端管理台 / C 端内容…）

确定一个清晰的设计方向并显式说明（如："教育 B 端管理台 → 采用简洁专业的数据密度型风格，主色深蓝，无装饰"），再执行设计。确保每次有鲜明的设计主张，不走保守路线。

**③ 主流组件库**
追加询问具体选哪个组件库（Ant Design / Material Design / Element Plus / Arco Design），按对应设计规范生成 CSS 风格和组件结构：
- Ant Design：`--primary: #1677ff`，圆角 6px，表格/表单密集布局
- Material Design：`--primary: #6750A4`，圆角 12px，Material You 风格
- Element Plus：`--primary: #409EFF`，圆角 4px，企业中后台风格

### 移动端布局模式

- 顶部 Navigation Bar（标题 + 返回按钮）
- 主内容区域（可滚动）
- 底部 Tab Bar（主导航）
- 基准宽度 375px，响应式缩放

### Web 端布局模式

- 左侧 Sidebar（功能导航，240px）
- 顶部 Header（面包屑 + 用户信息）
- 主内容区域（最大宽度 1200px，居中）

### 交互实现

- 页面切换：`show(pageId)` / `hide(pageId)`，CSS transition 过渡
- 移动端滑动返回：touch 事件监听，startX < 50 且滑动距离 > 100 触发
- 表单验证：即时反馈，红色边框 + 错误提示文字
- 加载状态：骨架屏或 spinner

### 原型内容规范

- 所有数据使用模拟数据（与真实业务无关）
- 点击可交互元素必须有视觉反馈（hover/active 状态）
- 空状态、加载状态、错误状态均需要呈现
- 还原 PRD 中的核心用户流程（至少覆盖主流程）
- 视觉设计必须能支撑评审：信息层级清楚、组件一致、页面密度符合场景、业务假数据可信

### 步骤4.5：质量自检（落盘前）

落盘前按 `prototype-judgment-card.md` 做 12 分制自检：

| 维度 | 通过标准 |
|------|----------|
| PRD 覆盖 | 页面、功能、关键状态覆盖完整 |
| 交互体验 | 核心任务可走通，点击/输入/切换有反馈 |
| 视觉设计 | 视觉方向明确，密度、组件、假数据可信 |

任一维度低于 3 分或总分低于 9 分，必须先自改 HTML，再进入截图与完成提示。

### 步骤5：截图与 manifest 生成

原型 HTML 生成完毕后，立即执行截图并写出 manifest，供后续 PDF 导出使用。

#### 5.1 截图

```bash
CHROME=~/Library/Caches/ms-playwright/chromium-1212/chrome-mac-arm64/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing"

mkdir -p {项目目录}/06-prototype/screenshots/

# 对每个原型页面截图（file:// 对 Chrome 二进制直接可用）
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --screenshot="{项目目录}/06-prototype/screenshots/01-{slug}.png" \
  --window-size=1440,900 \
  "file://{项目目录}/06-prototype/index.html" 2>/dev/null

# 若有子页面，逐一截图
"$CHROME" --headless=new --no-sandbox --disable-gpu \
  --screenshot="{项目目录}/06-prototype/screenshots/02-{slug}.png" \
  --window-size=1440,900 \
  "file://{项目目录}/06-prototype/pages/{page}.html" 2>/dev/null
```

**截图命名规则**：`{两位序号}-{小节slug}.png`，slug 取 PRD 章节标题的拼音首字母或英文关键词（如 `01-task-list.png`、`02-grading.png`）。

#### 5.2 写出 manifest.json

```bash
node -e "
const manifest = {
  generated_at: new Date().toISOString(),
  sections: [
    {
      prd_section: '6.1',
      label: '{章节标题，与 PRD 第六章小节标题一致}',
      file: 'index.html',
      screenshot: 'screenshots/01-{slug}.png'
    },
    {
      prd_section: '6.2',
      label: '{章节标题}',
      file: 'pages/{page}.html',
      screenshot: 'screenshots/02-{slug}.png'
    }
    // ... 按实际页面数量填写
  ]
};
require('fs').writeFileSync(
  '{项目目录}/06-prototype/screenshots/manifest.json',
  JSON.stringify(manifest, null, 2)
);
"
```

**关键约定**：`label` 字段必须与 PRD 第六章对应小节的标题**完全一致**（如 `"任务列表与任务分配"`），PDF 导出时依此做精确匹配。

## 文件结构

生成单文件原型（首选），所有代码内联：
```
{项目目录}/06-prototype/
├── index.html          # 全部 HTML + CSS + JS，无外部依赖
└── screenshots/        # 步骤5 自动生成
    ├── manifest.json
    └── 01-{slug}.png
```

若原型复杂（页面 > 5 个），可拆分为多文件：
```
{项目目录}/06-prototype/
├── index.html          # 入口页面
├── pages/              # 各页面 HTML
├── style.css
├── app.js
└── screenshots/        # 步骤5 自动生成
    ├── manifest.json
    ├── 01-{slug}.png
    └── 02-{slug}.png
```

## 步骤5.9：patch 根 README「当前阶段」（强制）

原型生成完毕（包含质量自检通过 + 截图落盘）后，**立即** patch `output/projects/{项目名}/README.md` 的「**当前阶段**」行：

格式：`{场景} 原型已完成（{质量自检总分}/12），{下一步 phase 描述}`

例：
- `组卷原型已完成（11/12 设计稿水准），某模块 PRD 待迭代`
- `首版原型已完成（10/12），待六角色评审`
- `某模块原型已完成（12/12），待 6/1 试点 Go Live`

**约束**：
- 只更新「当前阶段」这一行（位于根 README 第 5-6 行附近）
- **不动**其他字段（当前版本、关键时间点等由 ai-pm 或 PM 手动维护）
- 总分 < 9 分时仍可 patch，但措辞为「{场景} 原型 V0.x 草稿（{分数}/12），待修复后重审」

不 patch README 不算完成此步骤。详细模板见 `templates/project-index/root-readme.template.md`。

## 步骤6：完成提示 + 交互确认

### 6.1 输出完成摘要

```
原型生成完成！

文件位置：{项目目录}/06-prototype/index.html
预览方式：直接用浏览器打开 index.html

设备类型：{mobile/web/responsive}
设计规范：{规范名}
页面数量：{N} 个
核心流程：{流程描述}
质量自检：{总分}/12（PRD覆盖/交互体验/视觉设计）

截图已生成：06-prototype/screenshots/（共 {N} 张，供 PDF 导出使用）
根 README 已同步：「当前阶段」字段已更新

提示：点击可交互元素体验流程，数据为模拟数据。
```

### 6.2 下一步选择（必须执行）

输出完成摘要后，**立即**使用 **AskUserQuestion 工具**询问：

| 选项 | 说明 |
|------|------|
| 原型有问题，需要修改 | 说明具体要改什么，改完后重新截图，再回到本步骤 |
| 进行六角色评审 | 自动将原型截图更新至 PRD，启动评审（推荐）|
| 完成，不评审 | 自动将原型截图更新至 PRD，触发知识沉淀，项目收尾 |

**选「修改」时**：处理完用户反馈，重新执行步骤5截图，然后再次执行本步骤。

**选「评审」时**：先将截图写入 PRD，再调用 `ai-pm-review` 技能执行六角色评审，完成后触发知识沉淀。

**选「完成」时**：将截图写入 PRD，触发 knowledge sync，输出项目总结。
