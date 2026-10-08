---
name: ai-pm-update
description: >-
  AI_PM 版本升级技能。把用户的旧版 AI_PM 目录安全升级到新版，保留用户的个性化改造
  （三方合并：包内历史原件 / 用户目录 / 包内新版），支持备份与回滚。
  当用户说「升级 AI_PM」「更新 AI_PM」「AI_PM 出新版了」「我的改造会不会被覆盖」
  「升级时弹了个冲突」「update aipm」「回滚升级」时使用。
  边界：本技能只做 AI_PM 自身版本升级，不升级项目产物；不做自动检测更新（用户自行选择何时升级）。
argument-hint: "[--dry-run | rollback | --from 旧版包路径]"
allowed-tools: Read Write Edit Glob Grep Bash(mv) Bash(cp) Bash(mkdir) Bash(ls) Bash(test)
---

# AI_PM 版本升级

## 核心边界

- **不写独立脚本引擎。** 用户机上没有 python3 / git / node，唯一可靠存在的是 Claude 本身。合并由 Claude 用文件工具执行。
- **原地升级**，不做"落新目录"——换目录会丢 `.claude/projects/` 的会话记忆与断点续传。
- **升级前全量备份受管文件**到 `~/.ai-pm/update/backups/<时间戳>/`。
- **对账行未裁决 M != 0 时不得宣称升级完成。**
- **受管 = 白名单内的单文件，绝不目录级替换。** 判定与处置的三份单一事实源：
  - 受管范围、白名单语义、永不触碰 → `references/managed-scope.md`
  - 逐文件三方判定、冲突处理、结构化文件与知识库卡片的特殊规则 → `references/merge-protocol.md`
  - 计划书字段、对账行、审计留痕 → `references/report-format.md`

## 受管范围（一句话版）

明细只在 `references/managed-scope.md`，这里只留三条最容易搞错的：

- **显式白名单语义。** 未在受管清单中列出的路径一律不受管。`.codex/`（`hooks.json` 除外）、`.githooks/`、`tests/`、`AGENTS.md`、`README.md` 这些已是 tracked 的也不例外。
- **分类的键是「该文件是否 tracked」，不是路径前缀。** `templates/` 里同时装着官方骨架（tracked）和用户的个人知识库 / persona（未 tracked），按前缀切会整块归错。受管清单现含 `.gitignore` 与 `.codex/hooks.json` 两个**结构化文件**，它们走语法级合并、不走行级。
- **数据资产（知识库卡片、persona、打包携带的归档）走独立通道，不适用「永不触碰」。** 它们是分发物、不是升级合并对象，住在 `templates/knowledge-base/`、`templates/persona/`、`output/assets/`，字面上会撞上「`templates/` 下未追踪的文件」和「`output/`」两条——都按 `references/managed-scope.md` 的例外处理，别按字面拦。

不做的事：不升级 `output/` 下的项目产物；不碰 `docs/`、`.claude/projects/`、`.claude/settings.local.json`、`.d2c/`、`.ai-shared/`。

## 四阶段

### 阶段 1：识别

1. 确认当前目录是一份 AI_PM：存在 `.claude/skills/ai-pm/SKILL.md` 与 `CLAUDE.md`。不满足就停下问用户要目录，不要就地猜。
2. 识别用户当前版本：读包内 `meta/versions.json`，把用户目录里**未改动过**的受管文件与包内各版本比对，取命中最多的版本为 base。用户指定了 `--from 旧版包路径` 时以该包为准。
3. **识别不出时不猜**：报告"版本未识别"，走保守路径——用户改过的文件一律保留、不参与合并，官方新增文件照常落。
4. 检测用户改动过哪些受管文件（与 base 逐文件比对）。比对范围严格取受管清单，`git ls-files <路径>` 拿到什么就算什么；拿不到 git 就靠内容比对，别退化成"整个目录都算受管"。

### 阶段 2：计划

按 `references/merge-protocol.md` 逐文件判定，产出计划书（字段与取值见 `references/report-format.md`）。
**不落盘。** 计划书呈现给用户过目。

计划书里每条 `conflict` 必须带上 Claude 的「第四种方案」和理由，不是 ours / theirs 二选一。

### 阶段 3：执行

1. 备份受管文件到 `~/.ai-pm/update/backups/<时间戳>/`，写 `INCOMPLETE` 标记（见「中断保护」）。
2. 按计划写回。`conflict` 条目**先呈现方案、等用户确认再写**，不自动落盘。
3. **结构化文件**（`.claude/settings.json`、`.gitignore`、`.codex/hooks.json`）不走行级合并——解析后取并集，合并后校验，校验不过判冲突上报、不落盘。行级合并会产出语法错误：`settings.json` 解析失败会让 SessionStart / PostToolUse / Stop 三组 hook 全部静默失效。
4. 知识库卡片按 `references/merge-protocol.md` 的知识库规则处理：dedup-key 主判据、**软退役**（写 `superseded-by`）、合并幂等锚、**绝不刷 `last-verified`**。物理删除必升用户。
5. **base 必须推进到新版。** 全部落盘完成后，把本次的官方新版登记为新的 base。这是升级实现的正确性条件：不推进的话，下一轮升级会把官方这批新增块**再插一遍**，而且**可能一个冲突标记都不出现**——用户看不到任何提示，只是每次升级后多攒一份重复段。

### 阶段 4：报告

输出对账行（格式见 `references/report-format.md`）：

```
总差异 N / 自动处理 N / 已裁决 N / 未裁决 M
```

`M != 0` → 明确告知"升级未完成，有 M 处待裁决"，退出码非零。不允许"报告打印出来了"就当作"人已过目"。

再向 `~/.ai-pm/update/history.jsonl` 追加一行留痕（0600，一次只追加完整一行），并在同一段回复里确认一句 base 已推进到新版。

## 冲突提示怎么写（用户看得懂的话）

规则里的裁决权在用户手上，但用户看不到 `base/ours/theirs` 三棵树——**提示要把"为什么弹了这个冲突"讲成人话**，否则用户只会看到一堆文件在报错。

三段式：这次官方改了什么 → 你本地改了什么 → 建议怎么合（+ 一句"若你的动机是 W，则保留你的版本"）。

**`.codex/hooks.json` 是必然会遇上的一例。** 它此前不在受管清单里，现在进了——因为它已是 tracked 的官方文件且用户会改。所以：

> 新版把 Codex 侧的 hook 配置纳入了升级范围（它随 AI_PM 分发，之前一直漏在外面）。你在这个文件里加过自己的配置，官方这次也动了它，所以弹了冲突。合并建议：保留你的 hook 条目、把官方的并进去；JSON 校验已经替你做过一遍，两种取舍都会重新校验。

`.codex/` 下其他文件仍不受管，`.codex/hooks.json` 也不是被"顺手带进来"的——是显式列进清单的，提示里要说清这一点。

## `rollback`

读 `~/.ai-pm/update/history.jsonl` 最后一行，取其中的 `backup_dir`，把备份目录内容写回受管路径，并清掉 `INCOMPLETE` 标记。

- 只回滚最后**一轮**。要退到更早的版本，连续执行，或按时间戳指定备份目录。
- 回滚后 base 一并退回到那一轮的 `from_version`，否则下一轮升级会拿错基线。
- 备份目录缺文件或 `history.jsonl` 没有可读行时，如实说"回滚不了、缺什么"，不要用当前目录内容顶替。

## `--dry-run`

只跑阶段 1、2，出计划书。不备份、不写 `INCOMPLETE`、不落盘、不写 `history.jsonl`。
结束语必须点明"这是预览，没有动过任何文件"。

## 中断保护

阶段 3 开始前在 `~/.ai-pm/update/` 写 `INCOMPLETE` 标记（含时间戳与备份目录路径），阶段 3 正常结束后删除。

下次启动见到 `INCOMPLETE`：**先提示用户有未完成的升级，问是否 rollback**，在用户答复前不进入新的升级。中途失败同理——标记不删、不假装成功；能回到一致状态就回，回不去就如实说明停在哪个文件。

## 输出前守门

- 对账行的 M 不为 0 时，有没有说"未完成"而不是"已完成"？
- 每个 `conflict` 有没有附第四种方案，而不是替用户在 ours / theirs 之间选？
- 结构化文件的合并产物有没有校验过就落盘？（没校验就落 = 可能悄悄废掉 hook）
- 知识库卡片有没有刷过 `last-verified`？合并动作本身不是核实。
- base 有没有推进到新版？（没推进 = 下一轮静默重复插入）
