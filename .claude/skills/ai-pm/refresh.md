# /ai-pm refresh — 项目状态对账与刷新

## 命令

```
/ai-pm refresh [项目名] [--check]
```

- 无参数：对账 `output/projects/` 下**所有项目**。
- `[项目名]`：只对账该项目。
- `--check`：**干跑**，只列 punch list 不改任何文件。

## 功能

跨项目把「`_status.json` 保鲜度 / README 索引漂移 / 死链」一次性对账，并按 **「机械层自动修 / 语义层留白 / 有损改动只标给 PM」** 的边界刷新。

> 为什么需要它：增量维护只在你跑某项目的 phase 时顺带更新那一个项目；session-start 检测只**提醒**不改。大批量删/搬文件后、或项目久未动，需要一次全局对账——这就是本命令。

## 数据源（不自己造轮子，复用已有检测器）

1. **状态滞后 + 死链**：
   ```bash
   node scripts/ai-sync/check-status-staleness.js output/projects --json
   ```
   返回 `[{name, issues:{stale:{updated,newestDate,newestFile}, dead:[{file,ref}]}}]`。
2. **索引漂移**（逐项目，仅有 `07-references/` 的项目）：
   ```bash
   node scripts/ai-sync/check-readme-index-drift.js output/projects/{项目名}
   ```
   exit 3 时输出 🔴 未索引（目录有 README 没登记）/ 🟡 孤儿（README 登记目录已删）。

## 执行流程

### 1. 采集

跑上面两个检测器，把结果按项目聚合成一张 punch list。区分**他人 PRD 项目**（README 顶部有「归属与学习边界」banner：教学监管 / 某K12教育平台新容器 / 某模块3.0 / 讲评融合）——这些**只动 `_status.json` 和索引，绝不写 `_memory`**。

### 2. 呈现 punch list（两种模式都先做这步）

```markdown
## 项目对账报告  ({日期})

| 项目 | 状态滞后 | 索引未登记 | 索引孤儿 | 死链 |
|------|---------|-----------|---------|------|
| {项目} | updated {旧}→{新} | {N} | {N} | {N} |
...
合计：N 项需处理
```

### 3. `--check` 模式 → 到此为止

不改任何文件。末尾提示：「确认后去掉 `--check` 执行刷新」。

### 4. 刷新模式（无 `--check`）→ 只做机械、无损的自动修

**✅ 自动修（确定性、无损、不涉语义）：**

- **状态滞后**：把 `_status.json` 的 `updated` 改成 `--json` 给的 `newestDate`（直接取检测器算好的值，不自己推日期）。只动 `updated`，`notes`/`last_phase` 等语义字段不动。
- **索引未登记（🔴）**：在对应 `07-references/README.md` 的分组表里**追加**一行 `| \`{文件名}\` | [待 PM 补充] |`。分组拿不准就放末尾「## 其他 / 待归档」分组。追加不删旧，零信息损失。

**⚠️ 不自动改，只在报告里列出请 PM 定夺（有损 / 需判断）：**

- **索引孤儿（🟡）**：README 登记了但目录已删——**可能是搬走/改名，不是该删**。列出，PM 决定「删行 / 改成表外注释 / 指向新位置」。
- **死链**：README 引用的文件不在了——同理可能改名/搬移。列出，PM 定夺。
- **一切语义字段**：当前版本行、`notes`、`_memory/L1` 决策、索引「用途」描述——**一律留 `[待 PM 补充]`，禁止编造**（参考 [[feedback_no_invented_roles]]）。

### 5. 收尾报告

```markdown
## 刷新完成

✅ 自动修（无损）：
  · {项目} _status.updated {旧}→{新}
  · {项目} 07-references 补登记 {文件}（用途标 [待 PM 补充]）

⚠️ 需你定夺（未动）：
  · {项目} 索引孤儿 {路径} —— 删行 / 改注释 / 指新位？
  · {项目} 死链 {路径} —— 改名还是已删？

复核：node scripts/ai-sync/check-status-staleness.js output/projects
```

刷新后复跑检测器确认 clean。

## 注意事项

- **机械层自动 / 语义层留白**是铁律：能确定性推导的（日期、追加占位行）才自动；任何要"理解内容才能写"的（用途、版本、决策、孤儿去留）都留给 PM，绝不脑补。参考 [[feedback_automate_dont_offload]]（能自动的别甩锅）与「禁止编造」的双重约束——两者不冲突：自动**检测+列清单**是减负，自动**写语义**才是越界。
- 他人 PRD 项目（带归属 banner）：只动状态/索引，不写 `_memory`。
- 不碰 `_memory/L1`/`L0` 的历史内容（append-only）；刷新只新增机械修，不重写既有详实内容（不降级）。
- 与 `/ai-pm doctor` 区别：doctor 查**技能框架**一致性；refresh 查**项目内容状态**对账。两者正交。
