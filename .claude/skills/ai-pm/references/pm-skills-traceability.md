# pm-skills 对标追踪表

> 对标对象：本机 `/Users/xiaowu/workplace/Third_Program/pm-skills` 当前 checkout，8 plugins / 65 skills / 36 commands。  
> 目标：证明“该吸收的产品判断能力已经吸收，不搬的部分有边界理由，暂缓的部分有触发器”。本表不是复刻清单。
> 维护位置：作为 AI_PM 技能参考资产随 `.claude/skills/ai-pm/references/` 版本化；`docs/plans` 仅保留路线图入口。

## 状态口径

| 状态 | 含义 |
|---|---|
| 已落地 | AI_PM 已有等价产品工作流或产物，不再重复造 skill |
| 精选落地 | 从 pm-skills 中吸收后，已按中国大陆 PM 语境本地化并接入现有流程 |
| 暂缓 | 真缺口，但低频或未到时机；触发后仍走本地化引擎、反例和 dogfood |
| 不拿 | 与 AI_PM 定位冲突、越界、法务/隐私风险高，或会稀释核心工作流 |
| 观察 | 当前不进入主流程；若后续高频出现，再单独评估 |

## 65 Skills 追踪

### 1. pm-product-discovery

| 源 skill | AI_PM 处理 | 归属 / 证据 | 说明 |
|---|---|---|---|
| `brainstorm-ideas-existing` | 已落地 | `.claude/skills/ai-pm-brainstorm/SKILL.md` | 已有 3-5 轮收敛式头脑风暴，不搬 PM/Designer/Engineer 固定角色模板 |
| `brainstorm-ideas-new` | 已落地 | `.claude/skills/ai-pm-brainstorm/SKILL.md` | 新产品想法同样走轻量对话收敛 |
| `brainstorm-experiments-existing` | 精选落地 | `.claude/skills/ai-pm/references/discovery-frameworks.md` | 纳入“先验再开发”的低成本验证纪律 |
| `brainstorm-experiments-new` | 精选落地 | `.claude/skills/ai-pm/references/discovery-frameworks.md` | 不搬 pretotyping 名词，落成灰度、单点试点、埋点、访谈、历史数据 |
| `identify-assumptions-existing` | 精选落地 | `.claude/skills/ai-pm-analyze/SKILL.md` | 新场景/新用户行为时强制产出关键假设与验证 |
| `identify-assumptions-new` | 精选落地 | `.claude/skills/ai-pm/references/discovery-frameworks.md` | 8 类风险保留为本地化检查槽位，不焊死行业内容 |
| `prioritize-assumptions` | 精选落地 | `.claude/skills/ai-pm/references/discovery-frameworks.md` | 高风险低信心假设优先先验 |
| `prioritize-features` | 已落地 | `.claude/skills/ai-pm-priority/SKILL.md` | 已有四维评分和批量需求回复模板 |
| `analyze-feature-requests` | 已落地 | `.claude/skills/ai-pm-priority/SKILL.md`, `.claude/skills/ai-pm-data/SKILL.md` | 批量提报走 priority；文本反馈先走 data feedback |
| `opportunity-solution-tree` | 精选落地 | `.claude/skills/ai-pm/references/discovery-frameworks.md` | 吸收 outcome/opportunity/solution/experiment 逻辑，不新增 OST 独立产物 |
| `interview-script` | 已落地 | `.claude/skills/ai-pm-interview/SKILL.md` | 已有访谈前准备、现场提问和验收追问 |
| `summarize-interview` | 已落地 | `.claude/skills/ai-pm-interview/SKILL.md` | 现场记录、用户原话、痛点、需求草稿已覆盖 |
| `metrics-dashboard` | 已落地 | `.claude/skills/ai-pm-data/SKILL.md` | metrics 和 dashboard 两条命令已覆盖，北极星收敛已接入 |

### 2. pm-product-strategy

| 源 skill | AI_PM 处理 | 归属 / 证据 | 说明 |
|---|---|---|---|
| `product-strategy` | 已落地 | `.claude/skills/ai-pm-strategy/SKILL.md` | AI_PM 采用战略沙盘，不复刻 9-section canvas 填表机器 |
| `startup-canvas` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | Founder 工具，当前阶段会稀释 PM 工作流 |
| `product-vision` | 已落地 | `.claude/skills/ai-pm-strategy/SKILL.md` | 产品级沙盘可讨论愿景、方向和资源取舍 |
| `value-proposition` | 已落地 | `.claude/skills/ai-pm-analyze/SKILL.md`, `.claude/skills/ai-pm-strategy/SKILL.md` | 进入产品定位、目标价值、用户场景，不单开英文 JTBD 模板 |
| `lean-canvas` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 创业画布类，不进入 AI_PM 主链路 |
| `business-model` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 商业模式画布不作为核心 PM 产物；战略沙盘可讨论但不模板化 |
| `monetization-strategy` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 真到商业化阶段再本地化，当前不做美式变现策略模板 |
| `pricing-strategy` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 定价属于 founder/商业化工具，当前不纳入 |
| `swot-analysis` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 触发器：正式战略评审或竞争格局材料需要结构化框架 |
| `pestle-analysis` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 同上，需换成大陆语境下的外部环境约束 |
| `porters-five-forces` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 同上，不直接搬五力填表 |
| `ansoff-matrix` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 同上，作为战略沙盘结构化弹药候选 |

### 3. pm-execution

| 源 skill | AI_PM 处理 | 归属 / 证据 | 说明 |
|---|---|---|---|
| `create-prd` | 已落地 | `.claude/skills/ai-pm-prd/SKILL.md` | AI_PM 已有 PRD 主流程、模板检查、导出与版本索引 |
| `brainstorm-okrs` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 触发器：正式目标管理/OKR 双轨材料需要结构化输出 |
| `outcome-roadmap` | 已落地 | `.claude/skills/ai-pm-strategy/SKILL.md`, `.claude/skills/ai-pm-priority/SKILL.md` | 方向推演和资源取舍走战略沙盘，具体需求排序走 priority；不单开 roadmap 命令 |
| `sprint-plan` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 排期、容量和估点是研发管理/项目管理边界 |
| `retro` | 已落地 | `.claude/skills/ai-pm-retrospective/SKILL.md` | 项目复盘已覆盖，并沉淀知识库建议 |
| `release-notes` | 精选落地 | `.claude/skills/ai-pm/release-docs.md`, `.claude/skills/ai-pm/references/release-docs-frameworks.md` | 本地化为“更新公告 + 操作手册 + 飞书发布”，反向去版本号 |
| `pre-mortem` | 精选落地 | `.claude/skills/ai-pm/phases/phase-8-review.md`, `.claude/skills/ai-pm/references/risk-frameworks.md` | 本地化为上线前风险预演，评审前强制前置 |
| `stakeholder-map` | 精选落地 | `.claude/skills/ai-pm-analyze/SKILL.md`, `.claude/skills/ai-pm/references/stakeholder-frameworks.md` | 拆成协作地图（内）和客户决策地图（外） |
| `summarize-meeting` | 不拿 | `templates/project-index/references-readme.template.md` | 通用会议纪要不进入 AI_PM 核心；会议资料作为项目 references 输入 |
| `user-stories` | 已落地 | `.claude/skills/ai-pm-story/SKILL.md`, `.claude/skills/ai-pm/phases/phase-4-stories.md` | 用户故事、验收标准、INVEST 自检已覆盖 |
| `job-stories` | 已落地 | `.claude/skills/ai-pm-interview/SKILL.md`, `.claude/skills/ai-pm-analyze/SKILL.md` | JTBD 逻辑进入访谈和需求分析，不单开 job-story 文档 |
| `wwas` | 已落地 | `.claude/skills/ai-pm/phases/phase-5-prd.md` | Why/What/Acceptance 被 PRD 功能规格与验收标准吸收，不保留 WWA 模板 |
| `test-scenarios` | 不拿 | `.claude/skills/ai-pm-review/SKILL.md` | 独立测试用例属 QA 边界；AI_PM 只检查可测试性、边界与异常 |
| `dummy-dataset` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 造假数据有误导风险，且不是 PM 核心交付 |
| `prioritization-frameworks` | 已落地 | `.claude/skills/ai-pm-priority/SKILL.md` | 保留本地四维评分；不继续堆 ICE/Kano 等低边际收益框架 |

### 4. pm-market-research

| 源 skill | AI_PM 处理 | 归属 / 证据 | 说明 |
|---|---|---|---|
| `user-personas` | 已落地 | `.claude/skills/ai-pm-analyze/SKILL.md` | 用户画像、场景、痛点分级已在需求分析输出中 |
| `market-segments` | 已落地 | `.claude/skills/ai-pm-analyze/SKILL.md`, `.claude/skills/ai-pm-research/SKILL.md` | 用户分层和竞品范围已覆盖，不做独立市场分群模板 |
| `user-segmentation` | 已落地 | `.claude/skills/ai-pm-data/SKILL.md` | 反馈文本可转主题、情感、Top 痛点和候选需求 |
| `customer-journey-map` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 触发器：onboarding 或端到端体验重设计；必须锚数据、痛点和行动 |
| `market-sizing` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | TAM/SAM/SOM 属投资人叙事，不进入主流程 |
| `competitor-analysis` | 已落地 | `.claude/skills/ai-pm-research/SKILL.md` | 竞品研究报告、对比矩阵、差异化机会已覆盖 |
| `sentiment-analysis` | 精选落地 | `.claude/skills/ai-pm-data/SKILL.md` | 已作为 `feedback` 子能力进入数据技能 |

### 5. pm-data-analytics

| 源 skill | AI_PM 处理 | 归属 / 证据 | 说明 |
|---|---|---|---|
| `sql-queries` | 观察 | `.claude/skills/ai-pm-data/SKILL.md` | 当前不引导 PM 直接写数仓 SQL；若用户高频要 SQL，再评估为数据侧协作附录 |
| `cohort-analysis` | 精选落地 | `.claude/skills/ai-pm-data/SKILL.md`, `.claude/skills/ai-pm/references/data-rigor-frameworks.md` | 留存强制按 cohort 和留存曲线看，不看被新用户稀释的整体率 |
| `ab-test-analysis` | 精选落地 | `.claude/skills/ai-pm-data/SKILL.md`, `.claude/skills/ai-pm/references/data-rigor-frameworks.md` | PM 做业务判断，统计实现留给数据侧 |

### 6. pm-go-to-market

| 源 skill | AI_PM 处理 | 归属 / 证据 | 说明 |
|---|---|---|---|
| `gtm-strategy` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 触发器：真进商业化或要系统化做 B/G 端 GTM |
| `beachhead-segment` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 作为 GTM 系统打法的一部分，不能直搬海外创业语境 |
| `ideal-customer-profile` | 已落地 | `.claude/skills/ai-pm-analyze/SKILL.md`, `.claude/skills/ai-pm/references/stakeholder-frameworks.md` | 用户画像和客户决策地图已覆盖核心需求，不搬 ICP 黑话 |
| `growth-loops` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 增长循环需结合渠道、运营、投放、私域或 B/G 端关系驱动后再本地化 |
| `gtm-motions` | 暂缓 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 同 GTM 系统打法 |
| `competitive-battlecard` | 精选落地 | `.claude/skills/ai-pm-research/SKILL.md`, `.claude/skills/ai-pm/references/competitive-frameworks.md` | 本地化为竞品对标卡/销售应对卡 |

### 7. pm-marketing-growth

| 源 skill | AI_PM 处理 | 归属 / 证据 | 说明 |
|---|---|---|---|
| `marketing-ideas` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 营销创意不是 AI_PM 当前主链路，容易变成泛文案工具 |
| `positioning-ideas` | 已落地 | `.claude/skills/ai-pm-analyze/SKILL.md`, `.claude/skills/ai-pm-research/SKILL.md`, `.claude/skills/ai-pm-strategy/SKILL.md` | 定位来自需求分析、竞品差异和战略沙盘，不单开营销定位模板 |
| `value-prop-statements` | 已落地 | `.claude/skills/ai-pm-analyze/SKILL.md`, `.claude/skills/ai-pm-prd/SKILL.md` | 进入产品定位、目标价值和 PRD 表达，不做销售文案生成器 |
| `product-name` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 品牌命名不属于 AI_PM 核心交付 |
| `north-star-metric` | 精选落地 | `.claude/skills/ai-pm-data/SKILL.md` | 已接入指标体系设计前的北极星收敛 |

### 8. pm-toolkit

| 源 skill | AI_PM 处理 | 归属 / 证据 | 说明 |
|---|---|---|---|
| `review-resume` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 个人求职工具，偏离项目级 PM 工作流 |
| `draft-nda` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 法务文书，高风险且非 AI_PM 核心 |
| `privacy-policy` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 隐私政策有合规红线，不能作为 PM 助手模板化生成 |
| `grammar-check` | 不拿 | `docs/plans/2026-06-05-localization-upgrade-roadmap.md` | 英文语法校对是通用写作工具，不进 AI_PM |

## 36 Commands 入口映射

### pm-product-discovery commands

| 源 command | AI_PM 对应入口 | 状态 | 说明 |
|---|---|---|---|
| `/discover` | `/ai-pm` 或 `/ai-pm analyze` | 已落地 | 完整发现链路拆进需求分析、假设验证、优先级和后续 PRD |
| `/brainstorm` | `/ai-pm brainstorm` | 已落地 | 轻量对话收敛 |
| `/triage-requests` | `/ai-pm priority`, `/ai-pm data feedback` | 已落地 | 结构化需求走 priority，非结构化反馈先做 feedback |
| `/interview` | `/ai-pm interview` | 已落地 | 访谈准备、记录、需求草稿和 PRD 衔接 |
| `/setup-metrics` | `/ai-pm data metrics`, `/ai-pm data dashboard` | 已落地 | 指标设计和仪表盘已覆盖 |

### pm-product-strategy commands

| 源 command | AI_PM 对应入口 | 状态 | 说明 |
|---|---|---|---|
| `/strategy` | `/ai-pm strategy` | 已落地 | 以战略沙盘替代 canvas 填表 |
| `/business-model` | 无主入口 | 不拿 | 商业模式画布不进入主链路 |
| `/value-proposition` | `/ai-pm analyze`, `/ai-pm strategy` | 已落地 | 产品定位和目标价值已覆盖 |
| `/market-scan` | `/ai-pm strategy` 候选增强 | 暂缓 | 正式战略评审需要时再本地化 SWOT/PESTLE/五力/安索夫 |
| `/pricing` | 无主入口 | 不拿 | 定价策略不纳入当前 AI_PM |

### pm-execution commands

| 源 command | AI_PM 对应入口 | 状态 | 说明 |
|---|---|---|---|
| `/write-prd` | `/ai-pm prd` | 已落地 | PRD 生成、模板检查、导出和版本策略已覆盖 |
| `/plan-okrs` | `/ai-pm strategy` 候选增强 | 暂缓 | 需要 OKR/KPI 双轨材料时再做 |
| `/transform-roadmap` | `/ai-pm strategy`, `/ai-pm priority` | 已落地 | 方向推演和需求排序分开处理 |
| `/sprint` | `/ai-pm retrospective`, `/ai-pm release-docs` | 部分覆盖 | retro/release 覆盖；sprint plan 不拿 |
| `/pre-mortem` | `/ai-pm review` 前置风险预演 | 精选落地 | 阶段 8 强制执行 |
| `/meeting-notes` | 项目 references 输入 | 不拿 | 通用会议纪要不做 AI_PM 主入口 |
| `/stakeholder-map` | `/ai-pm analyze` | 精选落地 | 多团队/外部决策链时触发 |
| `/write-stories` | `/ai-pm story` | 已落地 | 用户故事和验收标准已覆盖 |
| `/test-scenarios` | `/ai-pm review` 的可测试性检查 | 不拿 | 不生成独立 QA 用例 |
| `/generate-data` | 无主入口 | 不拿 | 不生成造假数据 |

### pm-market-research commands

| 源 command | AI_PM 对应入口 | 状态 | 说明 |
|---|---|---|---|
| `/research-users` | `/ai-pm analyze`, `/ai-pm interview` | 已落地 | persona/segmentation/interview 已覆盖；journey map 暂缓 |
| `/competitive-analysis` | `/ai-pm research` | 已落地 | 竞品研究报告和差异化机会已覆盖 |
| `/analyze-feedback` | `/ai-pm data feedback` | 精选落地 | 反馈文本主题、情感、痛点、候选需求已覆盖 |

### pm-data-analytics commands

| 源 command | AI_PM 对应入口 | 状态 | 说明 |
|---|---|---|---|
| `/write-query` | 无主入口 | 观察 | 当前不把 SQL 生成作为 PM 主流程 |
| `/analyze-cohorts` | `/ai-pm data insight` | 精选落地 | 真做留存时强制 cohort/留存曲线纪律 |
| `/analyze-test` | `/ai-pm data metrics abtest` 或 `/ai-pm data insight` | 精选落地 | A/B 结论按 ship/extend/stop 做业务判断 |

### pm-go-to-market commands

| 源 command | AI_PM 对应入口 | 状态 | 说明 |
|---|---|---|---|
| `/plan-launch` | `/ai-pm strategy` 候选增强 | 暂缓 | 真到 B/G 端 GTM 系统打法时再做 |
| `/growth-strategy` | `/ai-pm strategy` 候选增强 | 暂缓 | 增长循环需先换土壤 |
| `/battlecard` | `/ai-pm research` | 精选落地 | 对销售/客户压力场景触发竞品对标卡 |

### pm-marketing-growth commands

| 源 command | AI_PM 对应入口 | 状态 | 说明 |
|---|---|---|---|
| `/market-product` | `/ai-pm strategy`, `/ai-pm research` | 部分覆盖 | 定位和价值表达覆盖；营销创意和命名不拿 |
| `/north-star` | `/ai-pm data metrics` | 精选落地 | 北极星指标已进入指标体系设计 |

### pm-toolkit commands

| 源 command | AI_PM 对应入口 | 状态 | 说明 |
|---|---|---|---|
| `/review-resume` | 无主入口 | 不拿 | 个人求职工具 |
| `/tailor-resume` | 无主入口 | 不拿 | 个人求职工具 |
| `/draft-nda` | 无主入口 | 不拿 | 法务文书 |
| `/privacy-policy` | 无主入口 | 不拿 | 隐私合规红线 |
| `/proofread` | 无主入口 | 不拿 | 通用英文写作工具 |

## 后续维护规则

1. pm-skills 源仓更新后，先重新列出 `skills/*/SKILL.md` 和 `commands/*.md`，再改本表。
2. 任何 `暂缓` 项触发后，不直接搬原版；必须经过 `localization-card.md`、大陆反例和 dogfood。
3. 任何 `不拿` 项要变更状态，必须先说明 AI_PM 定位变化和风险处理方式。
4. `观察` 项只代表“不是当前主流程”，不是“已经覆盖”。
