# Reconcile 契约速查

## 事实优先级

`用户最新明确决策 > 已确认当前产品证据 > 当前项目权威文档 > 历史资料 > AI 推断`

同级冲突进入 `pending-decision`，不静默覆盖。

## Baseline

落点：`01-baseline-manifest.json`。它是 `01-baseline-delta.md` 的机读扩展，不替代人工可读 delta。

关键字段：

- `sources[]`：来源身份、观察时间、水位/hash/revision、权威级别。
- `claims[]`：稳定 `claim_id`、事实类型、陈述、风险、状态、来源和 aliases。
- `open_questions[]`：尚未解决的问题及风险。

高风险 claim 无来源必须阻断；中风险无来源警告；低风险只留痕。迭代/import 项目 claims 为空不能通过。

## Artifact Registry

落点：现有 `_status.json.artifacts`，不新增独立状态文件。

每条至少包含：

```text
artifact_id
type
path_or_remote_id
authoritative_source
version_or_hash
producer_capability
dependencies
owner
status
last_verified_at
```

`authoritative_source` 只允许：

- `local-primary`
- `cloud-primary`
- `mixed`
- `external-reference`

本地与云端权威源不明确时，不执行写入；本技能首版没有 apply。

## Bootstrap

`aipm_contracts.py bootstrap` 默认只输出 JSON 预览。`--apply` 只在项目尚无 baseline/artifacts 时写入候选骨架，拒绝覆盖已有登记。

自动发现只覆盖：PRD、HTML 原型、评审、analytics、上线文档和验收材料。README 不作为待协调产物。自动登记的 `dependencies=[]` 必须由 PM 根据 claim 补齐；空依赖不代表无影响。

## 严格门禁

```bash
python3 scripts/aipm_reconcile.py --project "<项目目录>" --strict
```

退出码：

- `0`：没有 issue，或未启用 strict 的正常 preview。
- `1`：strict 模式发现 stale/conflict/pending-decision/coverage-gap。
- `2`：项目、JSON 或契约不可读。
