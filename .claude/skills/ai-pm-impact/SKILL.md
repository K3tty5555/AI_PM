---
name: ai-pm-impact
description: >-
  产品交付效果回收技能。把目标、指标口径版本、发布锚点、发布前基线、观察窗口、定量数据、定性反馈和下一步决策串成可追溯记录。当用户说「上线后效果怎么样」「复盘这个功能有没有用」「看发布后的指标」「做效果回收」「impact」「继续还是调整」「要不要停止」时使用。允许“证据不足，继续观察”，没有发布锚点、基线或有效证据时不得强行给继续/调整/停止结论；不自动连接业务数据源，不未经确认回写项目事实。
---

# 产品效果回收

## 工作流

1. 读取当前项目的 PRD 目标、指标口径、发布材料和已有 analytics；先查本机事实字典，未覆盖的业务指标明确标注“口径未覆盖”。
2. 建立 impact record 预览：

   ```bash
   python3 scripts/aipm_impact.py init \
     --project "<项目目录>" \
     --objective "<本次要验证的目标>" \
     --released-at "<发布日期，可空>" \
     --release-evidence "<发布记录，可空>"
   ```

   预览默认零写；用户确认后才追加 `--write`，落到 `09-analytics/impact-record.json`，并登记到 `_status.json.artifacts`。已有记录或登记冲突时拒绝覆盖。
3. 补齐指标或定性证据：
   - rate 指标必须写分子、分母、口径版本、基线与观察来源。
   - count/duration/score 也必须写定义、版本和来源。
   - 定性反馈必须有 evidence_id、时间、来源和摘要，不用单条声音冒充总体结论。
4. 运行契约检查：

   ```bash
   python3 scripts/aipm_impact.py validate --record "<impact-record.json>"
   ```

5. 结合证据形成四类结论之一：`continue / adjust / stop / observe`。尚未分析完成可保持 `pending`，但不能回写项目事实。
6. 用户确认结论后，才把 `fact_updates` 逐项回写 baseline 或 L1 决策；脚本不自动做这一步。
7. 渲染报告：

   ```bash
   python3 scripts/aipm_impact.py render --record "<impact-record.json>"
   ```

   默认输出到终端；需要落盘时显式传 `--out "<项目目录>/09-analytics/impact-report.md"`。当 record 位于项目 `09-analytics/` 下时，报告也会登记产物与哈希。

## 判断边界

- `continue / adjust / stop` 必须有发布锚点、依据和至少一组可用的“基线+观察”或定性证据。
- 没有基线、口径变了、样本窗口不足或来源不可核实时，使用 `observe` 并写清下一步补证动作。
- 相关性不等于因果；没有实验或排除外部变化时，不写“由本功能导致”。
- 指标结论只使用已确认口径；不要替数据、算法或业务方编数字。
- 给老师或最终用户的话术不透露版本号、上线时间或下个迭代。

字段说明见 `references/impact-contract.md`。
