# AI_PM

Claude Code 的产品经理技能集合，输入需求自动完成分析、PRD、原型、评审全流程。

## 这是什么

AI_PM 是一组运行在 Claude Code 上的技能（Skills），面向产品经理日常工作场景。输入一句需求描述，自动完成竞品研究、用户故事拆解、PRD 撰写、原型设计和六角色评审。支持多项目并行管理和断点续传，不同项目的输出文件相互隔离。项目根目录下有 `AI_PM_教程中心.html`，用浏览器打开可查看所有功能的可视化使用指南。

## 快速开始

**前置条件：** 已安装 [Claude Code](https://claude.ai/code)

```bash
# 1. 克隆项目
git clone <repo-url>
cd AI_PM

# 2. 在 Claude Code 中打开项目目录
# File > Open Folder，选择 AI_PM 目录

# 3. 开始使用
/ai-pm
```

## 项目结构

```
.claude/
├── agents/                自定义 sub-agent（含 pm-agent KettyWu 灵魂）
└── skills/                技能集合（ai-pm 主控 / ai-pm-prd / ai-pm-driver / ...）
.ai-shared/                Claude ↔ Codex 协作桥接（见下方 .ai-shared 规范）
output/                    项目输出（projects/ 项目 + assets/ 产品级长期资产，不纳入版本库）
templates/                 模板库（PRD 风格、设计规范等，仅含通用示例）
AI_PM_教程中心.html          可视化使用指南，直接用浏览器打开
CLAUDE.md                  本文件
README.md                  项目介绍
```

## 技能速查

| 命令 | 场景 |
|------|------|
| `/ai-pm [需求]` | 完整产品流程（需求→PRD→原型） |
| `/ai-pm --team [需求]` | 复杂需求，启用多代理协作 |
| `/ai-pm priority` | 需求优先级评估（批量处理提报需求） |
| `/ai-pm strategy` | 战略沙盘（项目级 / 产品级战略推演） |
| `/ai-pm-strategy-verify` | 战略求证侦察兵（证据挖到尽头，交回反转+岔路；沙盘的后半场） |
| `/ai-pm weekly` | 生成工作周报 |
| `/ai-pm interview` | 现场调研/客户访谈模式 |
| `/ai-pm data [文件]` | 数据洞察分析 |
| `/ai-pm persona` | 产品分身（学习你的写作风格） |
| `/ai-pm design-spec` | 设计规范（加载公司/团队 UI 规范） |
| `/ai-pm knowledge` | 知识库管理 |
| `/ai-pm driver [PRD]` | PM 风格 lint（评审前体检），pm-agent 的命令糖衣 |
| `/ai-pm acceptance [PRD]` | 产品验收（对照 PRD 在测试环境逐条核实，出提单台账） |
| `/ai-pm release-docs [PRD\|项目]` | 上线文档套件（更新公告 + 操作手册，可发飞书；去版本号） |

## PRD 写作专项（PM Agent 4 层体系）

写 PRD 章节遵循 4 层架构（完整方法见 `.claude/skills/ai-pm/references/pm-judgment-card.md`）：

1. **判断卡**（`references/pm-judgment-card.md`）—— PM 风格手册：角色定位 / PM 直觉 / 越界红线 / 责任分工 / Agent 5 件事写法 / 模板使用原则 / 篇幅指引 / 修订日志规则 / 输出前守门 checklist / 概念回源与命名（§9.2）/ 行话黑名单机器块（§9.3，含 Given-When-Then）/ 防膨胀五道闸+填充废话三反模式（§七）/ 云文档增强 emit 规则（§十）
2. **pm-agent**（`agents/pm-agent.md`）—— KettyWu sub-agent 内化判断卡 + 越界红线 + 填空模板 + 自检。**写每个 PRD 章节前优先调用** `Agent(subagent_type=pm-agent, prompt=...)`
3. **写作脚手架**（`phase-5-prd.md` 内嵌）—— 填空模板 + 7 组反例对比库 + 自检三连问；pm-agent 不可用时主对话回退路径
4. **driver**（`ai-pm-driver/`）—— PM 风格 lint，pm-agent 的 thin wrapper。**评审前 / 大改后 / 历史 PRD 回归** 跑一次，不每章节都跑

**铁律（PM 必守）**：

| 维度 | 必写 | 禁写 |
|------|------|------|
| 技术细节 | "由研发与 X 对齐" | 技术栈 / 接口字段名/路径/枚举值 / 数据库表 |
| 视觉细节 | "风格与 Z 一致"或不写 | 毫秒 / 像素 / 色号 / hover/fade/光环/闪烁 等动画词 |
| 算法实现 | "由算法侧定义"，Few-shot 标 `[算法补完]`；**确定的公式不算算法**（统计公式直接写口径 / 教研提案公式待教研拍 / 真价值权重才待算法，三分法见判断卡 §四） | prompt 文案 / 模型名 / chunk_size / RAG 检索器 |
| 异常处理 | 用户能感知到的失败（业务数据不足、答错等）| 接口超时 / Schema 校验 / 缓存未命中（研发自决）|
| 用户话术 | "暂时不支持 + 替代方案" | 透露版本号 / 上线时间（V1.5、下个迭代）|

**文档分型**：决策评审（decision-review-template）/ 全员评审（普通=feishu-template；Agent=+agent-supplement 增量包）——**选型细则与 doctype 机读字段单源 = phase-5-prd 步骤 A.0/A.0.1 + 判断卡 §六**，此处只留一句防线。

**结构（迭代版本）**——⚠️ **迭代 / 小补丁也走完整模板**：§一 文档概述(修订日志表) / §二 需求分析 / §三 功能清单表 / §六 详细功能设计(每功能一表) 是**承重骨架、必有**；小迭代仅可省 §四 产品流程 / §五 全局说明 + 每格 terse，**不塌成 bullet 版**（精简 bullet 版 = 无模板 = 质量不可控、禁用；详见判断卡 §6 二分）。下面四项是**叠加在模板之上的迭代专属约定**、不替代骨架：
- 影响范围（每个改动列受影响的页面/接口/角色/已存量场景）—— 必表达，但形式随规模：重评审 PRD 独立成章，轻量迭代行内「同步影响：…」即可
- 暂不纳入本期（单列章节：反馈 / 原因 / 后续计划）—— 迭代专属约定层、非承重骨架
- 复用对照表（§4.x，4 列：复用对象 / 复用方式 / 本期改动点 / 不改动项）—— ⚠️**仅"功能迁移 / 老系统接新引擎"类才写**（如批改 V3 旧版答题卡接新版AI批改）；普通迭代（修 bug / 调参 / 加开关）**不写**，制卡 V1.5–V1.8 即无，用行内「同步影响」代替（见 PITFALL-070）
- 附录 B「待 X 对齐」（技术字段 / 接口设计 / 算法实现等待对齐项）—— 有待对齐项时才写

**修订日志规则**：V1.0=首评基线全熔；+V1.x 唯一条件=定稿后再次正式发出（**单源=判断卡 §八**，此处只留一句防线）。

**篇幅指引**（KettyWu范本）：单功能补丁 80-150 行 / 中等场景 200-300 行 / 复杂含 Agent 章节 300-500 行 / 500+ 警戒。

## 原型设计专项（Prototype Agent 体系）

原型生成遵循"蓝图前置 + 视觉设计 + 质量审计"链路（完整方法见 `.claude/skills/ai-pm/references/prototype-judgment-card.md`）：

1. **判断卡**（`references/prototype-judgment-card.md`）—— 原型目标、蓝图必答、视觉红线、场景化策略、Agent 原型专项、12 分制审计、防 bleed 两套哲学（§0：原型=镜像零解释）、HANDOFF.md 设计师交接规格（原型示意 cell 四态协议在 **PM 判断卡 §七**，本卡不含）
2. **prototype-agent**（`agents/prototype-agent.md`）—— 原型设计负责人，负责原型蓝图、视觉方向、生成约束、质量审计。**生成 HTML 前优先调用** `Agent(subagent_type=prototype-agent, prompt=...)`
3. **Phase 7 脚手架**（`phase-7-prototype.md`）—— 在页面框架搭建前锁定页面/流程/状态/视觉方向；落盘后做 PRD 覆盖 + 交互体验 + 视觉设计审计
4. **质量门槛**—— 12 分制：PRD 覆盖 / 交互体验 / 视觉设计各 0-4 分；任一维度 < 3 或总分 < 9，必须修完再评审

### 视觉锚点包（Codex 生图协作）

需要继承现网截图/历史原型视觉节奏，或用户要高保真视觉稿级原型时，启用 `{项目目录}/06-prototype-visual/`。**流程/角色分工/状态机单源 = `templates/visual-anchor/README.md`**（Claude 只读写 request.json 不调生图；manifest ready 后 HTML 必须继承视觉指纹；图中文字不作事实源）。状态检查：`node scripts/ai-sync/check-visual-anchor-package.js output/projects/{项目名}`。

**铁律（原型必守）**：
- 原型不是线框草图，必须可评审、可体验、视觉可信
- 视觉设计是原型质量的一部分，不能因为是原型就接受模板套壳、灰白卡片、假数据糊弄
- B 端重信息密度和扫描效率，不能做成营销页；C 端重路径流畅和引导，不能做成后台表格脸
- Agent / hybrid 原型必须体现用户输入、AI 回复、AI 状态、结果预确认、用户修改入口、失败兜底
- HTML 原型可以落具体视觉和 CSS，但不要把像素/色号/动效毫秒写回 PRD 功能表格

## 设计与研发自动审视

- **brainstorming 产出设计方案后**，在写入设计文档之前，必须调用 `multi-perspective-review` 技能进行多视角审视
- **writing-plans 产出实施计划后**，在开始执行之前，必须调用 `multi-perspective-review` 技能进行多视角审视
- 审视结果呈现给用户后，由用户决定修订哪些问题，不自动修订

## 强制规范（Claude 必须遵守）

- UI/HTML 输出设计规范三档可选，**首次生成 HTML 时询问用户并记住项目偏好**：①公司/团队规范（已上传后自动生效）②AI 情境定制（自动注入项目自带 `ai-pm-frontend-design`，用户本机有 `impeccable:frontend-design` 时作为增强）③主流组件库（Ant Design / Material / Element Plus 等）
- **用户指定代码仓/组件库做前端时，先高优先级评估并优先复用它的组件，而不是直接 CSS 复刻观感**：①先盘点库实际导出的组件（读 `index.d.ts`/`exports`），别只读它的 `DESIGN_PROMPT`/设计 token —— 读"复刻提示词"≠用组件（这步不能省，"没看就复刻"是根病）②逐区块映射，默认有组件就用；只有「库没有对应组件（图表/分层/连线/时间轴等定制布局）」或「评估后该组件质量/适配确实差」时才手写或换方案 ③弃用组件是逃生口、不是默认：必须**逐个**说清哪不行（可定制性/无障碍/视觉/bug），且优先「包一层 / 覆盖样式」而非整段重写，不能"觉得不好用"就整页推翻 ④所有手写/弃用组件的区块显式报给用户原因 ⑤"用这个仓库"语义不清（视觉参考 vs 真组件搭）时先问
- PRD/PDF/DOCX 导出的中文字体仍使用 `PingFang SC`，不受设计规范选择影响
- 数据分析 Excel 文件必须用 `openpyxl data_only=True`
- **查业务数据（metric）/ 写 PRD 涉及业务实体前，先读本机事实字典 `scripts/.metrics-dict.md`**（口径/实体/权限线/能力边界，Stage4-B1）：命中直接用；未覆盖明确说「口径未覆盖」，先小探测再问用户，不硬拼；踩到新坑当场往字典补一行（入库模板 `scripts/.metrics-dict.example.md`，真实字典 gitignore 仅本机）
- **grep / 搜记忆或语料里的业务实体前，先 `python3 scripts/entity-expand.py "<词>" --grep` 把词扩成所有叫法再搜**（Stage4-B2 同物异名归一，字典表三）：治「同一功能/权限项有多个称呼」这类同一物不同叫法的漏检；扩不出就查原词（不报错）；发现新异名往字典表三补一行
- Chart.js `indexAxis:'y'` 必须在 `options` 顶层，不能放在 `scales` 里
- 所有项目文件输出到 `output/projects/{项目名}/`；产品级长期资产（如全量需求池这类无项目流程、无完成态的活台账）放 `output/assets/{资产名}/`；不在这两处以外新建子目录
- 交互文案须经 humanizer-pm 处理，避免 AI 味

### Playwright MCP 使用规范

- Playwright MCP 配置为 headless Chromium（后台无界面运行），无需启动本地 HTTP 服务器
- 查看原生 HTML 文件直接用 `file:///绝对路径/文件名.html`，不需要 `python3 -m http.server`
- 截图/DOM 验证优先用 `browser_run_code` + `page.evaluate()` 而非 `browser_take_screenshot`（后者等待字体加载易超时）
- 若 Playwright MCP 报 `Browser "chrome-for-testing" is not installed`，不要直接运行 `npx @playwright/mcp install-browser chrome-for-testing`；先检查并复用本机缓存 `/Users/xiaowu/Library/Caches/ms-playwright`
- 本机已存在可用缓存：`chromium-1224`、`chromium-1223`、`chromium_headless_shell-1223`、`mcp-chrome-for-testing-*`
- shell 脚本方式需要显式指定浏览器缓存时，使用 `PLAYWRIGHT_BROWSERS_PATH=/Users/xiaowu/Library/Caches/ms-playwright`
- 只有确认缓存不可用且用户明确同意后，才下载安装 Playwright 浏览器

## 开发工具规范

> 注：本节提到的 `impeccable`、`skill-creator`、`self-improving` 等是**外部插件/技能**，随 Claude Code 插件市场或本机环境提供，**不随本仓库分发**。clone 本仓后若未安装对应插件，AI_PM 仍使用项目自带 `ai-pm-frontend-design` 生成 HTML 原型/仪表盘；外部插件仅作为增强能力。

### 客户端设计规范

客户端（Tauri App）有独立设计规范：**`docs/design-system.md`**（本机文件，docs/ 整体 gitignore；客户端已冻结，本节仅历史参考）。核心要点：
- 风格：Bauhaus + Apple HIG，钴蓝（`#1D4ED8`）Accent，纯白背景，8px 圆角
- 字体：GeistSans 优先，-apple-system 兜底（完整字体栈见 `docs/design-system.md`）；等宽字体仅限代码场景
- 侧边栏：220px 毛玻璃（`backdrop-blur-xl`），项目内显示 7 阶段列表
- 微交互：按钮按压 `scale(0.97)`，导航项 hover 背景过渡，阶段切换 fadeInUp
- ❌ 禁止：`uppercase tracking-[2px]`、`font-terminal` 用于 UI 元素、终末地风格

### 新页面开发 → AI_PM 本地设计内核 + `impeccable` 增强

- **客户端页面**（`app/src/pages/` 或 `app/src/components/`）：优先使用外部 `impeccable` 做视觉初稿；不可用时严格遵循 `docs/design-system.md` 和项目根 `.impeccable.md`。
- **AI 生成的 HTML 原型**：沿用三档选择机制（首次询问用户偏好并记住），**不受 `docs/design-system.md` 约束**。

### UI/UX 审查与迭代 → `ai-pm-frontend-design` + `impeccable`

- **客户端页面审查**：优先使用 `impeccable` 的审查命令：`/audit`（无障碍/性能/响应式）、`/critique`（UX 层级）、`/polish`（上线前精修）。
- **客户端页面迭代**：复杂交互/流程重设计优先使用 `impeccable` 套件，参考基准为 `docs/design-system.md`。
- **HTML 原型 / 数据仪表盘**：AI_PM 客户端流式生成时自动注入项目自带 `ai-pm-frontend-design`；用户本机存在 `impeccable:frontend-design` 时追加为增强。以用户选定的原型设计规范为准，不套用客户端规范。

### 新技能开发 → `skill-creator` 技能

在 `.claude/skills/` 下新建或修改 AI PM 技能文件时，通过 `skill-creator` 技能完成起草、测试和 description 优化，确保技能能被正确触发且输出质量稳定。

### 自我迭代 → `self-improving` 技能

开发过程中遇到流程不顺、规范缺失、反复踩坑时，调用 `self-improving` 技能进行复盘，将经验沉淀回本文件或对应 skill 文件。

## .ai-shared 目录规范

Claude ↔ Codex 上下文交换桥接目录；**子目录追踪矩阵单源 = `.ai-shared/README.md`**（内容文件一律仅本机、README 入库）。**铁律**：写入 `.ai-shared/` 的内容文件一律按"仅本机"处理，不得假设会上传 GitHub。评审意见交换走 `.ai-shared/review-exchange/`（协议见其 README，D3①）。

## 版本库隐私规范

以下内容禁止出现在任何 git 追踪文件中：

- **公司/产品名称**：templates/、.claude/skills/ 下的示例和反例只用通用占位（如"某 K12 教育平台"、`edu-topic-query`）
- **内部 API 字段名/枚举值**：不得出现真实接口路径、字段名、枚举值（如 `lib_scope: [company_code, ...]`）
- **内部产品线代号**：代码仓名称、内部服务名等一律替换为 `<your-codebase-path>/模块名` 形式
- **品牌色/设计 Token**：设计规范示例只保留通用色系，公司品牌色写 `根据产品实际情况填写`

**自检命令**（开源前 / PR 前 / 推广成跨团队共享前跑一次）：
```bash
bash scripts/regression-suite.sh --fast|--full   # 回归总入口：改判断卡/模板/校验器/agent 后必跑 --full（语料五分类基线）
bash scripts/check-share-readiness.sh --strict   # 分享就绪自检：内部名/敏感目录/source-project 一次过，退出码可做 gate
# 兜底手查：
git ls-files | xargs grep -l "公司名|内部关键词" 2>/dev/null
git ls-files | cat   # 检查文件名本身是否含公司名
```
> KettyWu 是工具招牌 persona（作者同意署名），在白名单内、不拦。**内部名清单放本机 `scripts/.share-denylist`（gitignore，绝不入库）**，新增内部名往那里补；模板见 `scripts/.share-denylist.example`。脚本本身不存任何真实内部名——否则检漏脚本自己成泄漏源（本工具踩过这坑）。

## 知识沉淀 Hook（§知识沉淀Hook）

收到 stop hook 触发词 `knowledge-capture` 时，**静默执行**以下步骤，不打字到聊天窗，不询问用户：

> **静默护栏（第一原则，压在所有知识库治理之上）**：任何自动/治理动作都不得打断或刷屏用户正在进行的操作。耗时执行（复核分诊、批量核实）只在用户**显式调用**知识命令时发生；自动路径（本 hook 沉淀、写入时退役）必须**静默、亚秒级、零额外输出**。⛔ 严禁出现"对话进行中突然长时间跑沉淀、把对话刷上去"。完整原则见 `ai-pm-knowledge/SKILL.md` §运行原则。

1. **判断是否有值得沉淀的内容**：必须同时具备「问题场景 + 解决方案」结构，缺任一段不沉淀
2. **跨次去重**：调 add 前先 grep 现有卡片标题/前 200 字，相似度高 → 追加验证数据而非新建
3. **source-project 双重校验**：cwd 路径 + 对话提及项目名，不一致或拿不准 → 标 `unknown`
4. **卡片标记**：`confidence=low, auto-generated=true, source-session=<session_id>, last-verified=created`
5. **不做退役判断**：hook 路径**只做 dedup-key 去重、不判断"取代旧卡"**（退役会软隐藏卡片，不能在无人监督时发生）；真退役留给有意识的 add/sync 与 review-stale
6. **有内容** → 调 `/ai-pm-knowledge add`；**无内容** → 直接 stop（hook 二次触发自动放行）
7. **超时约束**：30 秒内完成所有 add，否则跳过本次沉淀
8. **端到端留痕（JSONL）**：处置完向 `.claude/logs/knowledge-capture-events.jsonl` 追加一行 JSON：`{"ts":"YYYY-MM-DD HH:MM","session":"<会话id前8位>","outcome":"written|merged|skipped","artifacts":["卡名",…],"reason":null或跳过原因}`——机器可统计漏闭环率，不靠自述

## 禁止事项

- 不自动 git commit/push，除非用户明确要求
- 不跳过 git hooks（--no-verify）
- 不在 output/ 以外的地方生成项目文件
- **禁止说「我记住了/我会记住/已记录」等记忆声明，除非同一条回复里已执行 Write 工具将内容写入 `memory/` 目录。** 口头承诺 ≠ 记忆，未写文件等于未记。
