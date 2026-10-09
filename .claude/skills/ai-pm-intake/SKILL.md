---
name: ai-pm-intake
description: >-
  外部散乱工作区整合。把没用过 AI_PM 的用户散落全盘的项目产物与能力资产，
  盘点→确认→归位成正式项目与可用 skill。当用户说「整合我的文件」「我电脑里很乱，
  帮我归档进 AI_PM」「把这些项目导进来」「intake」时使用。
  边界：只读扫描不改原文件；不解析当前 AI_PM 项目；不自动合并已有项目。
argument-hint: "[路径]（缺省=全盘扫用户主目录）"
allowed-tools: Read Write Edit Glob Grep Bash(ls) Bash(python3) Bash(cp) Bash(mkdir) Bash(test)
---

# 外部工作区整合（intake）

## 三阶段（细节单源 = docs/superpowers/specs/2026-10-09-aipm-intake-design.md）

### ① 盘点
- 启动先跑 `python3 scripts/aipm_intake_scan.py unfinished`，有未完成 intake 先问用户续跑还是重开
- `python3 scripts/aipm_intake_scan.py scan --root <路径或~>`，拿 manifest 路径与簇数
- **语义聚类**：只读簇摘要 + 抽样文件头，不逐文件读（全盘底账可能上万条）。
  巨型簇（report 标 ⚠️）先按二级目录下钻再聚类；判断哪几簇是同一个项目（合并展示，
  执行时 --cluster-id 传多个）、哪份 md 最像 PRD（active_prd 候选）

### ② 确认（一次只问一件事）
- **进入本阶段先把 manifest.stage 改为 confirm**
- 逐项目：建议名/文件数/摘要/建议 lifecycle/active_prd 候选/复制总量（report 里的估算）；
  可确认/改名/剔除/跳过
- **每确认一项立即 Edit manifest 的 decisions[]**（中断不丢）
- skill 单独一轮：展示 description 全文+触发词+正文关键指令摘要+来源路径，
  明示「这段指令装上后会以你的身份被执行」；超宽 description/指示外发内容标红
- 合并到已有项目：v1 不做，只提示「疑似与已有项目 X 相关」

### ③ 执行
- **进入本阶段先把 manifest.stage 改为 exec**
- 每项目：`python3 scripts/aipm_intake_apply.py project --manifest M --cluster-id X --cluster-id Y --name 名 --active-prd 需求/x.md（落位后相对 05-prd/ 的路径，子目录保留）`
- skill：`python3 scripts/aipm_intake_apply.py skill --manifest M --path 相对路径 --name 名`
- **claims 提炼（执行器不做，必须由你补）**：读该项目 active_prd，提炼 2-3 条初始 claims
  （AI 推断·待确认口径）写进 01-baseline-manifest.json，来源指向该 PRD；
  不补这步项目卡在 baseline gate，无法继续迭代
- knowledge 草稿：把 prompt_assets 蒸馏成候选卡片写到 `output/_intake/{ts}/knowledge-drafts/`，
  收尾指引逐条走 /ai-pm-knowledge add，绝不直接写 templates/knowledge-base/
- 收尾：`finish` 子命令拿三口径对账行，向用户复述 + 提醒「原文件未动，后续修改不会自动同步」

## 红线
- 原文件只复制不移动不改名；凭证命中/超大文件默认跳过
- 项目名/skill 名撞存量一律停下问，绝不覆盖；名字必须过 sanitize（apply 会拒绝未 sanitize 的）
- 全盘扫描报告开头必须先讲「扫了什么、没扫什么」；执行前必须让用户看过复制总量估算
- `06-prototype/_imported/` 与 `07-references/intake-raw/` 会被 bootstrap 登记进台账
  （artifacts/sources 可见），但**不作为迭代布局基线**（无确认记录，基线取最新已确认版）
