---
name: ai-pm-prototype
description: >-
  原型生成技能。基于 PRD 先生成可同时浏览全部关键帧、能看清具体排版的中保真线框确认页，再生成可交互精细原型、
  巡检画廊和页面定点标注，支持移动端和 Web 端。
  首次生成时询问设计规范（公司规范 / AI 情境定制 / 主流组件库），项目内记住偏好。
  若项目存在 Codex 生成的视觉锚点包（06-prototype-visual/manifest.json），生成 HTML 前必须读取并遵循。
  当用户说「生成原型」「做原型」「可交互原型」「HTML原型」「页面原型」「低保真」「高保真原型」
  「原型巡检」「原型标注」「画个界面」「把PRD做成原型」时，立即使用此技能。
  边界：本技能用于「把已有 PRD/需求做成可评审原型」；脱离 PRD 的纯视觉探索、通用 UI 组件生成或视觉精修，可使用外部 impeccable 增强，但 AI_PM 原型默认以 ai-pm-frontend-design 为本地设计内核。
argument-hint: "[PRD路径 | --mobile | --web | --visual | --visual-strict]"
allowed-tools: Read Write Edit Bash(mkdir) Bash(ls) Bash(node) Bash(grep) Agent
---

# 原型生成

本技能必须同时使用 `.claude/agents/prototype-agent.md`、`.claude/skills/ai-pm/references/prototype-judgment-card.md` 和 `.claude/skills/ai-pm-frontend-design/SKILL.md` 的质量标准。

**默认目标 = 可操作级**（判断卡 §1.1，三档里最高档，上面没有更高的）——原型要能像上线后一样**自由操作**：占位按钮做成真交互（不留死按钮）、认有限意图+澄清兜底（不硬解析任意输入）、不假全量重算（只重计数可见数字）、L2 人机确认是真检查点。只有明确是一次性概念稿/纯内部碰撞才**有意识地**降档到可评审级或示意级，并说明原因；不主动降。

**验证必带视觉核对**（判断卡 §11）——经用户允许跑浏览器时，每个关键状态（每道闸、每个异常态、每个产出件页面）都要 `browser_take_screenshot` 在目标视口下肉眼核对。DOM 断言（存在/计数/可见/类名/文本）只验逻辑，验不出溢出/折行/竖排/对齐等纯视觉 bug，**全绿也照样错**；没截图核对的状态在审计里如实标"仅 DOM 验证、未视觉核对"，不谎报"全过"。

**本轮协作固化规则**：用户对页面职责、栏位归属、操作位置和状态文案的修正，优先级高于此前蓝图和 AI 假设；每次修改都要同步 `prototype-spec.json`、精细原型、巡检页、截图 manifest 和 active PRD，不能只改其中一层。

## 输入

- 主要：`{项目目录}/05-prd/<当前 PRD 文件>`（由 `_status.json.active_prd` 指定；首次默认 `05-PRD-v1.0.md`）
- 可选：`templates/ui-specs/{规范名}/`（自定义设计规范）
- 可选：`{项目目录}/.ai-pm-config.json`（项目配置，含 designSystem 字段）
- 可选：`{项目目录}/06-prototype-visual/manifest.json`（Codex 生成的视觉锚点包）
- 可选：`{项目目录}/06-prototype-visual/visual-fingerprint.md`（视觉指纹）
- 迭代项目必需：`{项目目录}/06-prototype/source-target-manifest.json`（Web/Mobile 分别声明现状证据、目标变化和不变项）

### 步骤0：先读输入文档

用户提供 PRD、云文档 URL 或“之前版本原型”时，先读取并记录事实源，再开始蓝图和页面设计。不得只凭用户一句总结直接生成页面；若是 i讯飞/飞书云文档，按 `.ai-shared/skill-index.md` 路由到项目登记的文档 skill，先取正文、标题大纲和相关截图/原型引用。

## 输出

主要产物：

- `{项目目录}/06-prototype/prototype-spec.json`
- `{项目目录}/06-prototype/lowfi/index.html`
- `{项目目录}/06-prototype/index.html`
- `{项目目录}/06-prototype/review/index.html`
- `{项目目录}/06-prototype/runtime/annotation-runtime.js`

完整契约与命令见 [references/collaboration-loop.md](references/collaboration-loop.md)。

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

### 步骤1.8：当前产品 source/target 对照（迭代项目强制）

在画蓝图前创建 `06-prototype/source-target-manifest.json`，字段 schema 见 `templates/project-index/prototype-source-manifest.schema.json`：

- Web 和 Mobile 分开登记；用户只做单端时，另一端可不列。
- `evidence_status=verified` 必须有截图、现网页面、代码仓或已确认原型等 source evidence。
- 0→1 项目没有当前产品时写 `not-applicable`，不能伪造 current state。
- `evidence_status=missing` 时允许做明确标注的假设稿，但不能宣称“已还原现状 / 已完成该端适配”，并在审计报告中列为阻断正式评审的问题。
- 每端分别写 `current_state / target_changes / unchanged`；禁止把 Web 结构缩窄后直接当移动端方案。

写完运行：

```bash
python3 scripts/aipm_contracts.py prototype --project "{项目目录}"
```

契约 error 未清零不进入蓝图；warning 必须进入审计报告。

### 步骤2：原型蓝图 + 视觉方向

生成 HTML 前先按 `ai-pm-frontend-design/references/design-brief.md` 形成内部 `Design Brief`，再按 `prototype-agent` 的 Mode A 产出原型蓝图；Agent 工具不可用时，主对话按同一角色规则执行。

Design Brief 必须从 PRD / 项目记忆 / 参考资料中提取：
- 目标产品、目标用户、使用场景、核心任务
- 设备形态、使用频率、协作关系、用户当时心态
- 视觉气质、反向偏好、公司规范/视觉锚点/代码仓指纹等约束
- 不确定但影响方向的问题；非关键缺口用假设补齐，不把假设当事实

蓝图必须包括：
- 页面/视图清单：每页目的、关键操作、是否需要截图占位
- 主流程：用户从哪里开始，如何完成核心任务
- 信息层级：首屏重点、次级信息、操作区、反馈区
- 状态清单：默认、空、加载、错误、成功；Agent 产品另含 AI 思考、工具失败、结果预确认
- 视觉方向：布局密度、色彩气质、字体层级、组件风格、留白比例、数据呈现方式
- 交互硬化：触控目标、focus、hover 替代、表单校验、长文本、移动端适配
- 生成硬约束：5-8 条可执行约束，必须覆盖反 AI 味、状态、响应式和业务假数据
- source/target 对照：当前已有能力、目标变化、不变项、证据缺口；Web/Mobile 分开写

### 步骤2.5：关键帧规格 + 中保真线框确认门

按 [references/collaboration-loop.md](references/collaboration-loop.md) 生成 `prototype-spec.json`，随后生成一个同时展示全部关键流程和关键帧的 `lowfi/index.html`。线框必须看清真实栏宽、导航、表单、列表、表格、画布、弹窗和操作区关系；每个关键帧下方允许用户记录问题。

- 0→1 原型，以及页面结构、主流程或关键状态变化：必须等待用户确认低保真。
- 纯视觉调整或局部小修：只有用户明确要求时可跳过，并记录原因。
- 未取得与当前 spec hash 一致的确认，不进入精细原型生成。

视觉设计是原型质量的一部分：
- 有代码仓设计指纹时，优先复用其布局、色值、组件密度
- 有视觉锚点包且 `status=ready` 时，优先遵循视觉锚点包中的视觉指纹和图片约束
- 有用户选定设计规范时，按该规范生成
- AI 情境定制时，必须给出符合产品场景的视觉主张，不退回通用 SaaS 模板

**布局职责锁定**：用户确认的“左 / 中 / 右”不是视觉建议，而是信息架构约束。规格必须写清每一栏承载什么、哪些操作禁止放入该栏。例如配置页若确定为“左题目列表 / 中间试卷切图 / 右答案设置”，则作答区的框选、拆分、合并、新增、删除和微调只能归中间工作台；右栏只能放答案、分值及其保存状态。后续反馈不得把已确认的栏位职责反向合并或移除。

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
- 按 `ai-pm-frontend-design/references/visual-system.md` 建立 4pt 间距、稳定字阶、语义色彩和反 AI 味视觉系统
- 按 `ai-pm-frontend-design/references/interaction-hardening.md` 补齐 focus、触控、表单、响应式、错误和边界状态
- 中间试卷、答题卡、扫描件等背景素材必须是干净、单一职责的本地位图或真实产品素材；不得把旧页面标题、按钮、表单、状态标签直接当作试卷切图复用。图片应完整适配容器，区域框再作为 HTML 交互层叠加。

## 技术规范

### 三档设计规范应用规则

**① 公司/团队规范**
加载 `templates/ui-specs/{规范名}/design-tokens.json`，将其中颜色、字体、间距、圆角 Token 映射为 CSS variables 写入 `<style>` 标签。

**② AI 情境定制**
生成原型时自动注入项目自带 `ai-pm-frontend-design`，并在用户本机存在时追加 `impeccable:frontend-design` 作为增强。执行本地设计内核的 Context Gathering：先识别目标产品、用户角色、设备形态、设计来源和状态清单，再决定视觉方向。

若项目根 `.impeccable.md` 描述的是 AI_PM 桌面客户端，只能提取通用质量要求，不得把其品牌色、字体、圆角、导航结构套给另一个业务原型。不得退回 `ui-ux-pro-max` 或通用 AI 审美。

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
- **防 bleed（原型 = 镜像，零解释）**：屏幕只留用户真会看到的字，不写对评审解释产品的注解（溯源括号、"原型示意"、权限 meta caption）——细则见 prototype-agent 核心信念 7

### 步骤4.5：质量自检（落盘前）

落盘前先按 `ai-pm-frontend-design/references/audit-polish.md` 执行 `critique → audit → polish` 三段式自检，再按 `prototype-judgment-card.md` 做 12 分制自检：

| 维度 | 通过标准 |
|------|----------|
| PRD 覆盖 | 页面、功能、关键状态覆盖完整 |
| 交互体验 | 核心任务可走通，点击/输入/切换有反馈 |
| 视觉设计 | 视觉方向明确，密度、组件、假数据可信 |

三段式自检必须特别检查：
- Anti AI Slop：紫蓝渐变、玻璃拟态、暗色发光、hero metric、机械卡片网格、灰白卡片蓝按钮等通用 AI 味
- 交互状态：default / hover / focus / active / disabled / loading / error / success
- 响应式与边界：移动端、长文本、触控目标、200% 缩放、横向溢出
- UX 文案：按钮动作明确，错误给恢复路径，空状态给下一步，loading 说明正在做什么

任一维度低于 3 分、总分低于 9 分，或三段式自检出现 stop condition，必须先自改 HTML，再进入截图与完成提示。

落盘后、截图前必须执行 HTML 资源门禁：

```bash
python3 scripts/aipm_prototype_collab.py check-html \
  --html "{项目目录}/06-prototype/index.html"
```

门禁至少检查 body、重复 `id`、`script/img/iframe` 本地资源是否存在。巡检生成器的运行逻辑必须包在 IIFE 中，不能在浏览器全局声明 `frames` 等宿主已有变量；原型文件或运行时更新后，引用地址要携带内容版本参数，避免浏览器继续加载旧文件。

### 步骤4.6：防 bleed 审计 + 设计师交接（落盘后强制，与 phase-7 同源）

与 `/ai-pm` 全流程的 phase-7 共用一套机制，此处只接线不复制（细则见 `phases/phase-7-prototype.md` 同名两节）：

1. **可见文案防 bleed 审计（forced-artifact）**：`grep -nE "原型示意|用于说明|可读不可点|标了来自|不进学生端|评审|PRD|规则如下" {项目目录}/06-prototype/*.html`，命中逐条填「可见文案 / 用户真会看到吗 / 是否 PRD meta / 处理动作」四列表，落 `06-prototype/visible-copy-audit.md`；**命中不自动删**（AI 对用户的真话术留，对评审解释的 meta 挪走）
2. **设计师交接文件**：产 `06-prototype/HANDOFF.md`（页面清单 / 状态清单 / 组件策略 / 视觉约束来源 / 未实现交互 / 假数据边界 / 接手注意点）——**规格只进这里**，不写进 HTML 屏幕、不写回 PRD 功能表格

### 步骤4.7：巡检画廊 + 定点标注

精细原型生成后，按 [references/collaboration-loop.md](references/collaboration-loop.md)：

1. 给关键元素写入稳定 `data-aipm-id`。
2. 注入本地标注运行时，支持功能说明、评审评论、问题和修改意见。
3. 生成 `review/index.html`，按流程展示全部真实关键帧，允许逐帧记录结论和评论。
4. 用户反馈导出 JSON；AI 只先生成修改预览，用户确认后才修改原型。

收到“相关意见已经提交 / 已提完修改”时，先按文件修改时间读取 `feedback/review-feedback.json` 和 `feedback/annotations.json`，以最新导出内容为准；不要等待用户再次转述标签内容。修改前生成修改预览，修改后将已处理项改为 `pending-review`，保留原始评论和锚点。

巡检页的最低可用性要求：

- 左侧关键帧导航和右侧巡检记录可独立收起，收起后保留可见恢复按钮，并持久化展开状态。
- 中间 iframe 必须有加载中和超时提示；加载失败不能只显示白屏。
- 原型 iframe 地址必须带内容版本参数；标注运行时解析路由时忽略该参数，避免同一页面因缓存版本产生重复反馈。
- 页面定点标注表单只保留“类型”和“内容”；已有标签支持“删除标签”并在删除前二次确认，文档引用、期望结果等上下文直接写入内容，历史 JSON 字段继续兼容但不再在 UI 展示。

### 步骤5：截图与 manifest 生成

原型 HTML 生成完毕后，**只有用户明确授权浏览器核验时**才执行截图并写出 manifest，供 PRD 和后续 PDF 导出使用。未授权时只做静态检查，并在状态中记录“未做视觉截图核对”。

#### 5.1 截图

```bash
mkdir -p {项目目录}/06-prototype/screenshots/

# 对每个关键帧截图：使用 Playwright 打开本地 HTTP 服务，等待图片加载完成；不要用带标注浮层和临时 toast 的状态截图。
# 浏览器优先复用本机缓存或已安装浏览器；MCP 报版本缺失时先查缓存，禁止直接下载。
# 每个 query 都要执行：page.goto(url, {waitUntil: "networkidle"}) → 等待 document.images 解码
# → 隐藏 #aipm-annotation-host 和临时 toast → page.screenshot({path, fullPage: false})。
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

截图完成后必须：

1. 对每张图片写入 SHA-256、视口、捕获状态、控制台错误、页面错误和横向溢出结果。
2. 更新 active PRD 对应“原型示意”图片和说明，图片路径必须可读；页面结构或交互发生变化时，旧截图不能继续作为当前事实源。
3. 用户要求同步云文档时，按 `xfchat-wiki` 的“先读最新版 → 按 heading 定点替换 → 读回校验”流程更新，不得 `clear_first=True` 整篇重建；原型截图写入对应表格单元格后再做图片结构校验。

### 核心流程图

PRD 的“核心流程”优先使用 Mermaid 代码块表达，而不是堆叠长句。设置页、作答区、结果页等并行路径用 `flowchart TD` 或 `flowchart LR`，节点文案使用产品内真实动作；云文档 API 会将 Mermaid 写为代码块，必要时在云文档内手动开启流程图插件渲染。

## 文件结构

生成单文件原型（首选），所有代码内联：
```
{项目目录}/06-prototype/
├── prototype-spec.json # 页面、关键帧、流程和稳定元素 ID
├── lowfi/index.html    # 全部关键帧同屏的中保真线框确认页
├── index.html          # 精细可交互原型
├── review/index.html   # 精细原型巡检画廊
├── runtime/            # 本地标注运行时
├── feedback/           # 导入后的正式反馈与修改预览
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
- `组卷原型已完成（11/12 设计稿水准），错题巩固 PRD 待迭代`
- `首版原型已完成（10/12），待六角色评审`
- `错题巩固原型已完成（12/12），待 6/1 试点 Go Live`

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
低保真确认：06-prototype/lowfi/index.html
精细原型巡检：06-prototype/review/index.html
预览方式：均可直接用浏览器打开

设备类型：{mobile/web/responsive}
设计规范：{规范名}
页面数量：{N} 个
核心流程：{Mermaid 流程图已写入 PRD 4.1}
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

**选「评审」时**：先将截图写入 active PRD；如果 PRD 有 i讯飞云文档正本，再按用户授权执行云端定点同步，随后调用 `ai-pm-review` 技能执行六角色评审，完成后触发知识沉淀。

**选「完成」时**：将截图写入 PRD，触发 knowledge sync，输出项目总结。
