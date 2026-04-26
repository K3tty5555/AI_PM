---
generated_at: 2026-04-26 16:03:33 +0800
source: .claude/skills
do_not_edit: true
---

# Claude Skill 索引

| Skill | 入口 | 用途 |
|------|------|------|
| `humanizer-zh` | `.claude/skills/Humanizer-zh/SKILL.md` | 去除文本中的 AI 生成痕迹。适用于编辑或审阅文本，使其听起来更自然、更像人类书写。 基于维基百科的"AI 写作特征"综合指南。检测并修复以下模式：夸大的象征意义、 宣传性语言、以 -ing 结尾的肤浅分析、模糊的归因、破折号过度使用、三段式法则、 AI 词汇、否定式排比、过多的连接性短语。 |
| `agent-team` | `.claude/skills/agent-team/SKILL.md` | 需求复杂、需要多角色并行协作时使用（通常由 ai-pm --team 自动调度，也可直接调用）。 当用户说「多代理模式」「并行执行」「需求很复杂需要团队协作」「--team模式」「多角色协同」时使用此技能。 |
| `ai-pm-analyze` | `.claude/skills/ai-pm-analyze/SKILL.md` | 需求分析技能。深入分析产品需求，挖掘用户画像、核心痛点、功能范围和优先级。 通过对话引导用户补充信息，不满足于表面描述。 当用户说「分析需求」「帮我想清楚这个需求」「需求到底解决什么问题」「用户痛点是什么」 「需求挖掘」「功能分析」「做用户画像」「这个需求值不值得做」时，立即使用此技能。 |
| `ai-pm-brainstorm` | `.claude/skills/ai-pm-brainstorm/SKILL.md` | 客户端头脑风暴对话技能。帮助产品经理在 3-5 轮内快速理清想法，收敛出可执行结论。 |
| `ai-pm-data` | `.claude/skills/ai-pm-data/SKILL.md` | 数据分析技能。提供数据指标设计、数据洞察分析、仪表盘生成三大能力。从数据中发现产品需求和优化机会。 当用户说「分析数据」「上传Excel」「数据洞察」「数据可视化」「做仪表盘」「数据看板」 「指标设计」「埋点方案」「从数据里找需求」「数据报表」时，立即使用此技能。 |
| `ai-pm-design-spec` | `.claude/skills/ai-pm-design-spec/SKILL.md` | 设计规范技能。上传公司或团队的 UI 规范，让所有 HTML 输出（原型、仪表盘）自动遵守你们的设计标准，优先级高于 AI 情境定制。 当用户说「上传设计规范」「加载UI规范」「用公司规范」「Figma规范」「设计Token」 「统一原型风格」「公司色彩规范」「设计系统」时，立即使用此技能。 |
| `ai-pm-driver` | `.claude/skills/ai-pm-driver/SKILL.md` | PM 风格 lint 命令入口（评审前最后一道关）。 本 skill 是 `pm-agent` 的 thin wrapper——接收 PRD 文件路径，调用 pm-agent 用 lint mode 扫描整份 PRD，输出 punch list（越界  缺失  篇幅）。 与 `pm-agent` 的关系：driver = 命令糖衣 / pm-agent = 真正的判断引擎。判断卡 / 反例 / 越界规则单一事实源在 pm-agent，driver 不重复维护。 与 `ai-pm-review`（六角色评审会）和 `multi-perspective-review`（多视角技术审查）的区别：driver 是 PM 个人风格 lint，5 分钟出结论。 当用户说「PM 守门」「审视 PRD」「PRD 挑刺」「PRD 越界检查」「driver 一下」「PRD 自审」「评审前体检」「历史 PRD 回归」时，使用此 skill。 |
| `ai-pm-interview` | `.claude/skills/ai-pm-interview/SKILL.md` | 现场调研技能。适用于线下与客户面对面沟通场景，支持结构化访谈、实时记录和快速生成 PRD。 当用户说「现场调研」「客户访谈」「用户访谈」「拜访客户」「面对面沟通」「帮我设计访谈问题」 「用户研究」「访谈提纲」「带客户调研」时，立即使用此技能。 |
| `ai-pm-knowledge` | `.claude/skills/ai-pm-knowledge/SKILL.md` | 产品知识库管理技能。沉淀方法论、决策记录、踩坑经验，下次遇到类似问题时自动推荐。 当用户说「保存经验」「记录决策」「沉淀知识」「踩坑记录」「搜索知识库」 「之前有没有遇过类似问题」「知识管理」「经验总结」「记下来」时，立即使用此技能。 |
| `ai-pm-persona` | `.claude/skills/ai-pm-persona/SKILL.md` | 产品分身技能。分析你的历史需求文档，学习你的写作风格、措辞习惯和结构偏好。让 AI 生成的 PRD 越来越像你写的。 当用户说「学习我的风格」「让PRD像我写的」「分析我的文档」「风格设置」「个性化PRD」 「我想让输出更像我的语气」「训练分身」「风格模仿」时，立即使用此技能。 |
| `ai-pm-prd` | `.claude/skills/ai-pm-prd/SKILL.md` | PRD 生成技能。整合需求分析、竞品研究、用户故事，输出完整的产品需求文档。支持产品分身写作风格和设计规范。 当用户说「生成PRD」「写PRD」「产品需求文档」「需求文档」「功能规格书」「输出PRD」 「帮我写需求」「把需求整理成文档」时，立即使用此技能。 |
| `ai-pm-priority` | `.claude/skills/ai-pm-priority/SKILL.md` | 需求优先级评估技能。接收批量提报需求，按四维评分模型（业务价值/实现成本/用户影响/战略契合度） 自动评估优先级，输出排序结果和可直接发给提报方的回复模板。 当用户说「需求排期」「先做哪个」「优先级打分」「需求太多不知道从哪开始」「帮我判断优先级」 「这些需求怎么排」「RICE 评分」「需求筛选」时，立即使用此技能。 |
| `ai-pm-prototype` | `.claude/skills/ai-pm-prototype/SKILL.md` | 原型生成技能。基于 PRD 生成可交互的单页网页原型，支持移动端和 Web 端。 首次生成时询问设计规范（公司规范 / AI 情境定制 / 主流组件库），项目内记住偏好。 当用户说「生成原型」「做原型」「可交互原型」「HTML原型」「页面原型」「低保真」「高保真原型」 「画个界面」「把PRD做成原型」时，立即使用此技能。 |
| `ai-pm-research` | `.claude/skills/ai-pm-research/SKILL.md` | 竞品研究技能。分析市场同类产品，输出功能对比、差异化机会和市场定位建议。 当用户说「研究竞品」「分析竞争对手」「市场调研」「同类产品对比」「友商分析」「看看别人怎么做的」 「有哪些竞品」「竞争格局」「行业分析」时，立即使用此技能。 |
| `ai-pm-retrospective` | `.claude/skills/ai-pm-retrospective/SKILL.md` | 项目复盘技能。项目完成后，基于全流程产出物进行复盘，总结经验、识别改进点、 提炼可复用的产品方法论。 |
| `ai-pm-review-modify` | `.claude/skills/ai-pm-review-modify/SKILL.md` | PRD 评审后修改技能。基于评审报告和指定修改策略，对现有 PRD 进行定向修改，保持文档结构不变， 只修改评审指出的问题，输出完整的修改后 PRD。 |
| `ai-pm-review` | `.claude/skills/ai-pm-review/SKILL.md` | PRD 或原型已写完，需要模拟正式评审会议、让六大角色出评审意见时使用（区别于 multi-perspective-review 的设计阶段审查）。 当用户说「评审PRD」「需求评审」「PRD有没有问题」「帮我挑毛病」「技术评审」「开评审会」 「PRD走查」「需求质量检查」「PRD评审报告」时，立即使用此技能。 |
| `ai-pm-story` | `.claude/skills/ai-pm-story/SKILL.md` | 用户故事编写技能。基于需求分析和竞品研究，编写详细的用户故事和验收标准。 当用户说「写用户故事」「用户故事拆解」「验收标准」「功能场景拆解」「需求拆解」 「用例编写」「As a user」「Given When Then」「故事点」时，立即使用此技能。 |
| `ai-pm-weekly` | `.claude/skills/ai-pm-weekly/SKILL.md` | 工作周报生成技能。引导输入本周工作内容（随意描述即可），自动归类整理，生成结构化周报。 支持向上汇报版（简洁）和团队同步版（详细）。 当用户说「写周报」「整理本周工作」「帮我总结这周」「生成汇报材料」「本周做了什么」「出一份周报」 「向上汇报」「工作汇报」「周总结」「双周报」「月报」时，立即使用此技能。 |
| `ai-pm` | `.claude/skills/ai-pm/SKILL.md` | 当需要从零开始走完完整产品立项流程（需求→分析→竞品→用户故事→PRD→原型→评审）时使用。 支持多项目管理和断点续传，复杂需求可启用多代理协作。 当用户说「我有个产品想法」「帮我做个产品」「从零开始做需求」「全流程出PRD」 「做一个App/小程序/系统」「产品立项」「继续上次的项目」「切换项目」时，立即使用此技能。 |
| `frontend-design` | `.claude/skills/frontend-design/SKILL.md` | Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics. |
| `multi-perspective-review` | `.claude/skills/multi-perspective-review/SKILL.md` | 设计方案或实施计划完成后、定稿前需要多角色质量把关时使用（不是 PRD 正式评审会）。 当用户说「审视一下」「帮我审查」「检查这个设计」「review 一下」「看看有没有问题」 「多视角审视」「专家审查」「设计有没有漏洞」时触发。 |
| `pdf` | `.claude/skills/pdf-skill/SKILL.md` | 当需要操作 PDF 文件时使用：读取/提取 PDF 内容、PDF 转文字、合并/拆分 PDF、 填写 PDF 表单、加水印、OCR 扫描件、PDF 加密解密。 当用户说「读取PDF」「提取PDF内容」「合并PDF」「PDF转文字」「处理PDF」「OCR」时，立即使用此技能。 |
| `pm-gap-research` | `.claude/skills/pm-gap-research/SKILL.md` | 已明确 PRD 盲区或 Skill 参数空白，需要在与领域专家、真实用户或技术伙伴开会前设计问题清单时使用。 与 ai-pm-interview 的区别：interview 偏向初次调研/面对面单访，此技能偏向已有明确缺口、针对性填补的群体会议或对齐会。 当用户说「帮我设计问题」「我需要了解什么」「怎么问」「讨论提纲」「开会前准备问题」 同时存在已知的 PRD 章节空白或 Skill 参数不确定时，立即使用此技能。 |
| `tutorial-center-update` | `.claude/skills/tutorial-center-update/SKILL.md` | AI_PM 教程中心自动化更新 Skill。扫描所有 skills，增量更新单一 HTML 文件，完全离线可用。 当用户说「更新教程中心」「刷新教程」「教程中心过期了」「新增了技能需要更新文档」 「同步技能列表到教程」时，立即使用此技能。注意：必须增量编辑，禁止整体重写。 |
| `ui-ux-pro-max` | `.claude/skills/ui-ux-pro-max/SKILL.md` | UI/UX design intelligence and implementation guidance for building polished interfaces. Use when the user asks for UI design, UX flows, information architecture, visual style direction, design systems/tokens, component specs, copy/microcopy, accessibility, or to generate/critique/refine frontend UI (HTML/CSS/JS, React, Next.js, Vue, Svelte, Tailwind). Includes workflows for (1) generating new UI layouts and styling, (2) improving existing UI/UX, (3) producing design-system tokens and component guidelines, and (4) turning UX recommendations into concrete code changes. |

## 使用规则

- Codex 读取 skill 作为行为规范，但工具权限以 Codex 当前环境为准。
- 操作前先查已有脚本和工具，避免重写。
