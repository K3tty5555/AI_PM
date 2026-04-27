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
output/                    项目输出（不纳入版本库）
templates/                 模板库（PRD 风格、设计规范等）
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
| `/ai-pm weekly` | 生成工作周报 |
| `/ai-pm interview` | 现场调研/客户访谈模式 |
| `/ai-pm data [文件]` | 数据洞察分析 |
| `/ai-pm persona` | 产品分身（学习你的写作风格） |
| `/ai-pm design-spec` | 设计规范（加载公司/团队 UI 规范） |
| `/ai-pm knowledge` | 知识库管理 |
| `/ai-pm driver [PRD]` | PM 风格 lint（评审前体检），pm-agent 的命令糖衣 |

## PRD 写作专项（PM Agent 4 层体系）

写 PRD 章节遵循 4 层架构（完整方法见 `.claude/skills/ai-pm/references/pm-judgment-card.md`）：

1. **判断卡**（`references/pm-judgment-card.md`）—— 9 章节 PM 风格手册：角色定位 / 6 条 PM 直觉 / 越界红线 / 责任分工 / Agent 5 件事写法 / 模板使用原则 / 篇幅指引 / 修订日志规则 / 9 项 checklist
2. **pm-agent**（`agents/pm-agent.md`）—— KettyWu sub-agent 内化判断卡 + 越界红线 + 填空模板 + 9 项自检。**写每个 PRD 章节前优先调用** `Agent(subagent_type=pm-agent, prompt=...)`
3. **写作脚手架**（`phase-5-prd.md` 内嵌）—— 填空模板 + 7 组反例对比库 + 自检三连问；pm-agent 不可用时主对话回退路径
4. **driver**（`ai-pm-driver/`）—— PM 风格 lint，pm-agent 的 thin wrapper。**评审前 / 大改后 / 历史 PRD 回归** 跑一次，不每章节都跑

**铁律（PM 必守）**：

| 维度 | 必写 | 禁写 |
|------|------|------|
| 技术细节 | "由研发与 X 对齐" | 技术栈 / 接口字段名/路径/枚举值 / 数据库表 |
| 视觉细节 | "风格与 Z 一致"或不写 | 毫秒 / 像素 / 色号 / hover/fade/光环/闪烁 等动画词 |
| 算法实现 | "由算法侧定义"，Few-shot 标 `[算法补完]` | prompt 文案 / 模型名 / chunk_size / RAG 检索器 |
| 异常处理 | 用户能感知到的失败（业务数据不足、答错等）| 接口超时 / Schema 校验 / 缓存未命中（研发自决）|
| 用户话术 | "暂时不支持 + 替代方案" | 透露版本号 / 上线时间（V1.5、下个迭代）|

**结构必备（迭代版本）**：
- 复用对照表（§4.x，4 列：复用对象 / 复用方式 / 本期改动点 / 不改动项）
- 影响范围（每个改动列受影响的页面/接口/角色/已存量场景）
- 暂不纳入本期（单列章节：反馈 / 原因 / 后续计划）
- 附录 B「待 X 对齐」（技术字段 / 接口设计 / 算法实现等待对齐项）

**修订日志规则**：保留 PM-评审反馈迭代版本（v1.0 → v1.x），不保留 PM-AI 协作过程版本（PM 跟 AI 反复改的内部版本）。

**篇幅指引**（KettyWu范本）：单功能补丁 80-150 行 / 中等场景 200-300 行 / 复杂含 Agent 章节 300-500 行 / 500+ 警戒。

## 原型设计专项（Prototype Agent 体系）

原型生成遵循"蓝图前置 + 视觉设计 + 质量审计"链路（完整方法见 `.claude/skills/ai-pm/references/prototype-judgment-card.md`）：

1. **判断卡**（`references/prototype-judgment-card.md`）—— 原型目标、蓝图必答、视觉红线、场景化策略、Agent 原型专项、12 分制审计
2. **prototype-agent**（`agents/prototype-agent.md`）—— 原型设计负责人，负责原型蓝图、视觉方向、生成约束、质量审计。**生成 HTML 前优先调用** `Agent(subagent_type=prototype-agent, prompt=...)`
3. **Phase 7 脚手架**（`phase-7-prototype.md`）—— 在页面框架搭建前锁定页面/流程/状态/视觉方向；落盘后做 PRD 覆盖 + 交互体验 + 视觉设计审计
4. **质量门槛**—— 12 分制：PRD 覆盖 / 交互体验 / 视觉设计各 0-4 分；任一维度 < 3 或总分 < 9，必须修完再评审

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

- UI/HTML 输出设计规范三档可选，**首次生成 HTML 时询问用户并记住项目偏好**：①公司/团队规范（已上传后自动生效）②AI 情境定制（frontend-design 根据产品场景自主设计）③主流组件库（Ant Design / Material / Element Plus 等）
- PRD/PDF/DOCX 导出的中文字体仍使用 `PingFang SC`，不受设计规范选择影响
- 数据分析 Excel 文件必须用 `openpyxl data_only=True`
- Chart.js `indexAxis:'y'` 必须在 `options` 顶层，不能放在 `scales` 里
- 所有项目文件输出到 `output/projects/{项目名}/`，不在该目录外新建子目录
- 交互文案须经 Humanizer-zh 处理，避免 AI 味

### Playwright MCP 使用规范

- Playwright MCP 配置为 headless Chromium（后台无界面运行），无需启动本地 HTTP 服务器
- 查看原生 HTML 文件直接用 `file:///绝对路径/文件名.html`，不需要 `python3 -m http.server`
- 截图/DOM 验证优先用 `browser_run_code` + `page.evaluate()` 而非 `browser_take_screenshot`（后者等待字体加载易超时）

## 开发工具规范

### 客户端设计规范

客户端（Tauri App）有独立设计规范：**`docs/design-system.md`**，所有新页面、新组件必须遵循。核心要点：
- 风格：Bauhaus + Apple HIG，钴蓝（`#1D4ED8`）Accent，纯白背景，8px 圆角
- 字体：GeistSans 优先，-apple-system 兜底（完整字体栈见 `docs/design-system.md`）；等宽字体仅限代码场景
- 侧边栏：220px 毛玻璃（`backdrop-blur-xl`），项目内显示 7 阶段列表
- 微交互：按钮按压 `scale(0.97)`，导航项 hover 背景过渡，阶段切换 fadeInUp
- ❌ 禁止：`uppercase tracking-[2px]`、`font-terminal` 用于 UI 元素、终末地风格

### 新页面开发 → `impeccable` 套件

- **客户端页面**（`app/src/pages/` 或 `app/src/components/`）：通过 `impeccable`（`frontend-design` 增强版）生成视觉初稿，再落地到 Tauri + React 代码。impeccable 会自动读取项目根目录的 `.impeccable.md` 获取设计上下文，无需每次手动说明规范。
- **AI 生成的 HTML 原型**：沿用三档选择机制（首次询问用户偏好并记住），**不受 `docs/design-system.md` 约束**。

### UI/UX 审查与迭代 → `impeccable` + `ui-ux-pro-max`

- **客户端页面审查**：优先使用 `impeccable` 的审查命令：`/audit`（无障碍/性能/响应式）、`/critique`（UX 层级）、`/polish`（上线前精修）。
- **客户端页面迭代**：复杂交互/流程重设计用 `ui-ux-pro-max` 先输出分析方案，参考基准为 `docs/design-system.md`。
- **HTML 原型**：两个技能均可用，以用户选定的原型设计规范为准，不套用客户端规范。

### 新技能开发 → `skill-creator` 技能

在 `.claude/skills/` 下新建或修改 AI PM 技能文件时，通过 `skill-creator` 技能完成起草、测试和 description 优化，确保技能能被正确触发且输出质量稳定。

### 自我迭代 → `self-improving` 技能

开发过程中遇到流程不顺、规范缺失、反复踩坑时，调用 `self-improving` 技能进行复盘，将经验沉淀回本文件或对应 skill 文件。

## 禁止事项

- 不自动 git commit/push，除非用户明确要求
- 不跳过 git hooks（--no-verify）
- 不在 output/ 以外的地方生成项目文件
- **禁止说「我记住了/我会记住/已记录」等记忆声明，除非同一条回复里已执行 Write 工具将内容写入 `memory/` 目录。** 口头承诺 ≠ 记忆，未写文件等于未记。
