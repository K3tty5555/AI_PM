# 报告格式契约

## 计划书（升级前，不落盘）

每条动作一行，字段固定：

| 字段 | 取值 |
|------|------|
| `path` | 仓库根相对路径 |
| `kind` | `overwrite` / `create` / `delete` / `conflict` / `preserve` |
| `base` | 有 / 无 + blob，注明来源（base.json / manifest.json / 快照打分） |
| `reason` | 一句话为什么这么判 |

**`conflict` 条目必须附 Claude 的「第四种方案」与理由。**

## 对账行（机械可判定）

每次升级结束时必须输出这一行：

```
总差异 N / 自动处理 N / 已裁决 N / 未裁决 M
```

**`M != 0` → 退出码非零，升级未完成。**

不允许"报告打印出来了"就当作"人已过目"。

## 审计留痕

每轮升级向 `~/.ai-pm/update/history.jsonl` 追加一行（0600，一次只追加完整一行）：

```json
{"ts":"...","install_dir":"...","from_version":"...","to_version":"...","to_commit":"...","to_content_digest":"...","total_diff":N,"auto":N,"arbitrated":N,"unresolved":M,"backup_dir":"..."}
```

`install_dir` 是当前安装 `pwd -P` 的结果。一台机器装多份 AI_PM 时，rollback 和覆盖检测只认自己的行。

`to_commit`、`to_content_digest` 取新包 `versions.json` 的 `commit`、`content_digest`。SKILL 阶段 1 的覆盖检查拿本安装最后一条记录的这两项去比当前 `.aipm-dist/versions.json`，对不上就停。

rollback 也追加一行，带 `"action":"rollback"`：

```json
{"ts":"...","install_dir":"...","action":"rollback","backup_dir":"...","to_commit":"...","to_content_digest":"..."}
```

`backup_dir` 是这次拿来恢复的备份目录；后面的 rollback 据此跳过已经退过的那一轮。`to_commit`、`to_content_digest` 取换回之后的 `.aipm-dist/versions.json`，没有就不写。

格式参考 `~/.ai-pm/knowledge/capture-events.jsonl` 的既有约定。
