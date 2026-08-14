# Impact Record 契约

落点：`09-analytics/impact-record.json`；schema 单源：`templates/project-index/impact-record.schema.json`。

显式 `init --write` 会同步追加 `_status.json.artifacts[impact.record]`；显式渲染到项目内 `impact-report.md` 时追加 `impact.report`。两者都记录本地内容哈希，冲突时拒绝覆盖。

## 必需链路

`目标 → 发布锚点 → 指标口径版本 → 基线 → 观察 → 解释 → 结论 → 待更新事实`

## 指标字段

- `metric_id`：稳定英文 ID。
- `kind`：`rate / count / duration / score`。
- `definition`：业务定义。
- `numerator / denominator`：rate 必填。
- `version`：口径版本，不用产品版本号代替。
- `baseline`：`value / observed_at / source`，无基线写 `null`。
- `observations[]`：每条同样包含 value、观察时间和来源。

## 结论

- `continue`：目标信号改善或稳定达到门槛，继续当前方向。
- `adjust`：方向保留，但范围、流程、规则或运营动作需要调整。
- `stop`：价值不足、风险过大或假设被证伪。
- `observe`：证据不足、观察窗口未到或口径不可比。
- `pending`：记录尚未完成，不能回写项目事实。

结论引用 `metric_id` 或定性证据的 `evidence_id`；不能只写“用户反馈不错”。

`fact_updates[]` 只是待确认候选，每条必须写 `target=baseline|memory`、事实陈述和 `evidence_ids`。用户确认前不执行回写；证据 ID 不存在时契约直接报错。
