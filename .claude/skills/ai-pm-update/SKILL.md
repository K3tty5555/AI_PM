---
name: ai-pm-update
description: >-
  AI_PM 版本升级技能。把用户的旧版 AI_PM 目录安全升级到新版，保留用户的个性化改造
  （三方合并：新包里的历史原件 / 用户目录 / 新包），支持备份与回滚。
  当用户说「升级 AI_PM」「更新 AI_PM」「AI_PM 出新版了」「我的改造会不会被覆盖」
  「升级时弹了个冲突」「update aipm」「回滚升级」时使用。
  边界：本技能只做 AI_PM 自身版本升级，不升级项目产物；不做自动检测更新（用户自行选择何时升级）。
argument-hint: "[<新包文件夹> | --dry-run <新包文件夹> | rollback]"
allowed-tools: Read Write Edit Glob Grep Bash(mv) Bash(cp) Bash(mkdir) Bash(ls) Bash(test) Bash(pwd) Bash(realpath)
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
- **新包 = 用户双击 `AI_PM.zip` 解压出的文件夹。** 升级材料在 `<新包>/.aipm-dist/`，`<新包>/` 下其余文件就是新版。用户给的是 zip 就请对方先双击解压，不替用户解压。
- **`.aipm-dist/` 不是受管文件，不参与合并。** 它记录这份安装的版本（`versions.json`）和每个受管文件的比较基准（`base.json`），只按「阶段 3：执行」的切换步骤整体替换。
- **`.aipm-dist/` 里的文件一律用 Read 按完整路径读。** 安装根目录的 `.ignore` 会让 Grep / Glob 搜不到它们，搜不到不等于原件缺失。

## 受管范围（一句话版）

明细只在 `references/managed-scope.md`，这里只留三条最容易搞错的：

- **显式白名单语义。** 未在受管清单中列出的路径一律不受管。`.codex/`（`hooks.json` 除外）、`.githooks/`、`tests/`、`AGENTS.md`、`README.md` 这些已是 tracked 的也不例外。
- **分类的键是「该文件是否 tracked」，不是路径前缀。** `templates/` 里同时装着官方骨架（tracked）和用户的个人知识库 / persona（未 tracked），按前缀切会整块归错。受管清单现含 `.gitignore` 与 `.codex/hooks.json` 两个**结构化文件**，它们走语法级合并、不走行级。
- **数据资产（知识库卡片、persona、打包携带的归档）走独立通道，不适用「永不触碰」。** 它们是分发物、不是升级合并对象，住在 `templates/knowledge-base/`、`templates/persona/`、`output/assets/`，字面上会撞上「`templates/` 下未追踪的文件」和「`output/`」两条——都按 `references/managed-scope.md` 的例外处理，别按字面拦。

不做的事：不升级 `output/` 下的项目产物；不碰 `docs/`、`.claude/projects/`、`.claude/settings.local.json`、`.d2c/`、`.ai-shared/`。

## 五个阶段

### 阶段 0：先读新版规则

先 Read `<新包>/.claude/skills/ai-pm-update/SKILL.md` 和它的 `references/`，之后**按新版规则执行**：当前安装里的这份说明可能是旧协议。新包文件夹在工作目录之外时读文件会频繁弹权限确认，先请用户执行 `/add-dir <新包>` 把它加进来。

### 阶段 1：识别

1. 确认当前目录是一份 AI_PM：存在 `.claude/skills/ai-pm/SKILL.md` 与 `CLAUDE.md`。不满足就停下问用户要目录，不要就地猜。
2. 当前安装根下有 `.aipm-dist.incomplete` → 先按「中断保护」处理，不进入后面任何检查（中断时 `.aipm-dist/` 可能不存在，版本比较没有意义）。
3. 进入合并前的检查。先用 `pwd -P` 取当前安装的真实路径、`realpath "<新包>"` 取新包的真实路径（macOS 12 及更早没有 `realpath` 时，用 `ls -d "<新包>"` 确认存在后，按用户给的绝对路径比较，并在报告里注明未解析符号链接），再逐条对照。下文「落后条目」指新包 `manifest.json` 里有、而当前 `base.json` 里没有或 `blob` 不同的条目；带 `"held": true` 的条目不算落后（见阶段 3 第 5 步）。

   | 情况 | 处理 |
   |---|---|
   | `test . -ef "<新包>"` 为真（同一个文件夹） | 停，请用户回到旧安装里执行 |
   | 两边真实路径末尾都补 `/` 再比前缀，一方是另一方的前缀（一个在另一个里面）。`AI_PM` 与 `AI_PM 2` 是兄弟，不算包含 | 停，请用户把新包挪到别处再来 |
   | 给的路径下没有 `.aipm-dist/`，但它下面唯一的子文件夹里有 | 自动进一层，并告诉用户实际用的路径 |
   | 本安装（`install_dir` 相同）在 `~/.ai-pm/update/history.jsonl` 里最后一条记录的 `to_commit` + `to_content_digest` 与当前 `.aipm-dist/versions.json` 的 `commit` + `content_digest` 不同 | 停：**疑似**新包被直接解压覆盖在旧安装上，用户改过的文件可能已被冲掉。告诉用户别再动，从 `~/.ai-pm/update/backups/` 或自己的备份找回。本安装没有任何记录时不判覆盖（首次解压的安装本来就没有；这种情况被覆盖查不出来）；最后一条记录没带 `to_commit`（旧版留痕）时同样不判 |
   | 当前安装与新包的 `versions.json` 里 `commit`、`kind`、`content_digest` 都相同，且没有落后条目（不含 `held` 的；当前没有 `base.json` 时以当前 `manifest.json` 为准） | 停：已经是这一版。有 `held` 的文件就顺带列出来，说明它们按用户本地版本保留着 |
   | 同上，但有落后条目（不含 `held` 的；上一轮还有冲突没裁完） | **续跑**：只处理落后的文件；`held` 的文件顺带复看，仍走保守路径就在计划书里列出、不计入对账行 |
   | 新包的 `commit_time` 早于当前安装 | 停，问用户是不是把新旧弄反了 |
   | `kind` 不同（公共 ↔ 私有） | 先说明差别，用户确认后才继续 |
   | 新包缺 `.aipm-dist/manifest.json`，缺它里面列出的任一文件，或缺 `versions.json` 的 `probe_paths` 里任一路径（可以一次 `ls "路径1" "路径2" …` 批量查，报 No such file 的就是缺的；不数总数） | 停，列出缺的文件，提示多半是解压时被跳过，请解压到短路径（如桌面）重来 |

4. 识别每个受管文件的比较基准（base），按顺序：
   1. 当前安装有 `.aipm-dist/base.json` 就用它；没有就用 `.aipm-dist/manifest.json`（首次解压的安装只有这个）。采信前抽样：挑 5 个用户不太会改的受管文件（优先 `scripts/*.py`），用 Read 读 `<新包>/.aipm-dist/history/<blob>.blob` 与用户文件逐字比，**至少 4 个**一致才采信；原件缺失的文件不进样本。用户电脑上没有算校验码的工具，只能逐字比。
   2. 当前安装没有 `.aipm-dist/`，或上一条没过：用 `<新包>/.aipm-dist/history/revisions.json` 的快照逐版打分，取命中最多的版本；同分取较新的。
   3. 还是识别不出：报告「版本未识别」，走保守路径——用户改过的文件一律保留、不参与合并，官方新增文件照常落。

   base 原件从 `<新包>/.aipm-dist/history/<blob>.blob` 读。公共包会过滤含内部名称的旧原件，原件缺失的文件按保守路径处理。
5. 检测用户改动过哪些受管文件（与 base 逐文件比对）。本轮受管清单 = 新包 `.aipm-dist/manifest.json` 的路径 ∪ 当前安装 `base.json`（没有就用当前 `manifest.json`）的路径；后者用来认出官方已删除的文件。新版文件（theirs）按 `manifest.json` 逐条列，不用 Glob 扫目录。`git ls-files` 只作开发仓（有 `.git`）的备用来源。别退化成"整个目录都算受管"。本轮要写入的文件若是符号链接（`test -L`）或路径含 `..`、以 `/` 开头，跳过并在计划书里列出。

### 阶段 2：计划

按 `references/merge-protocol.md` 逐文件判定，产出计划书（字段与取值见 `references/report-format.md`）。
**不落盘。** 计划书呈现给用户过目。

`<新包>/.aipm-dist/history/index.json` 标为 `kind: binary` 的原件只做整文件比对与冲突提示，不做行级合并。

计划书里每条 `conflict` 必须带上 Claude 的「第四种方案」和理由，不是 ours / theirs 二选一。

### 阶段 3：执行

1. 备份受管文件到 `~/.ai-pm/update/backups/<时间戳>/`（`.aipm-dist/` 不在这里复制，第 6 步整体挪进去），在当前安装根下写 `.aipm-dist.incomplete`（见「中断保护」）。
2. 按计划写回。`conflict` 条目**先呈现方案、等用户确认再写**，不自动落盘。
3. **结构化文件**（`.claude/settings.json`、`.gitignore`、`.codex/hooks.json`）不走行级合并——解析后取并集，合并后校验，校验不过判冲突上报、不落盘。行级合并会产出语法错误：`settings.json` 解析失败会让 SessionStart / PostToolUse / Stop 三组 hook 全部静默失效。
4. 知识库卡片按 `references/merge-protocol.md` 的知识库规则处理：dedup-key 主判据、**软退役**（写 `superseded-by`）、合并幂等锚、**绝不刷 `last-verified`**。物理删除必升用户。
5. **base 按文件推进，落定一个推进一个。** 先把新包的 `manifest.json` 复制成 `base.json`（写在第 6 步的 `.aipm-dist.new/` 里），再把**没落定**的条目改回旧 blob：没裁决的冲突、走保守路径的文件都**不推进**。走保守路径保留下来的文件，沿用它在旧 `base.json` 里的条目（原来没有条目的，写一条不带 `blob` 的条目，base 仍算「无」），并在条目上加 `"held": true`；`held` 的条目不算落后，不会让下一轮无休止地续跑。续跑时把能判的 `held` 文件照常处理，落定后去掉 `held`。官方删除的文件落定后从 `base.json` 去掉；用户删除、官方仍保留的文件按合并协议询问用户，没答复前不推进。整体推进会让没合进来的官方改动永远丢掉，不推进又会让下一轮把官方新增块再插一遍——两头都静默。
6. **落盘与切换。** 把新包的 `versions.json`、`changelog.md`、`manifest.json`、`README.md` 和第 5 步的 `base.json` 写到当前安装的 `.aipm-dist.new/`；再 `mv .aipm-dist <备份目录>/aipm-dist.old`（若有；没有 `.aipm-dist/` 的安装跳过这一步）；最后 `mv .aipm-dist.new .aipm-dist`。历史原件不复制进来：下一轮升级从那时的新包里取。技能没有删除权限，旧目录只挪不删。
7. **留痕，再挪标记。** 切换完成后，向 `~/.ai-pm/update/history.jsonl` 追加一行留痕（0600，一次只追加完整一行，格式见 `references/report-format.md`）：带 `install_dir`（当前安装 `pwd -P` 的结果），以及 `to_commit`、`to_content_digest`（新包 `versions.json` 的 `commit`、`content_digest`，阶段 1 的覆盖检查靠它们）；这一步做完，才把 `.aipm-dist.incomplete` `mv` 进本轮备份目录。

### 阶段 4：报告

输出对账行（格式见 `references/report-format.md`）：

```
总差异 N / 自动处理 N / 已裁决 N / 未裁决 M
```

`M != 0` → 明确告知"升级未完成，有 M 处待裁决"，退出码非零。不允许"报告打印出来了"就当作"人已过目"。

留痕（含 `install_dir`）已在阶段 3 第 7 步写入。同一段回复里确认一句：已落定的文件 base 已推进到新版；没推进、也不是 `held` 的 N 个文件留在 `base.json` 里等续跑。`held` 的文件单独平铺列出：「这几个文件按你本地版本保留了，没合官方改动」。

只有 M = 0 且 N = 0 时，最后一句才告诉用户：升级已完成，新包文件夹 `<新包>` 可以删掉了，以后继续在当前这个 AI_PM 里用（会话记录跟着它）。否则不说这句，改说还剩几处待裁决、几个文件没推进，用同一个新包再跑一次就会续跑。

## 冲突提示怎么写（用户看得懂的话）

规则里的裁决权在用户手上，但用户看不到 `base/ours/theirs` 三棵树——**提示要把"为什么弹了这个冲突"讲成人话**，否则用户只会看到一堆文件在报错。

三段式：这次官方改了什么 → 你本地改了什么 → 建议怎么合（+ 一句"若你的动机是 W，则保留你的版本"）。

**`.codex/hooks.json` 是必然会遇上的一例。** 它此前不在受管清单里，现在进了——因为它已是 tracked 的官方文件且用户会改。所以：

> 新版把 Codex 侧的 hook 配置纳入了升级范围（它随 AI_PM 分发，之前一直漏在外面）。你在这个文件里加过自己的配置，官方这次也动了它，所以弹了冲突。合并建议：保留你的 hook 条目、把官方的并进去；JSON 校验已经替你做过一遍，两种取舍都会重新校验。

`.codex/` 下其他文件仍不受管，`.codex/hooks.json` 也不是被"顺手带进来"的——是显式列进清单的，提示里要说清这一点。

## `rollback`

先确定备份目录 `backup_dir`：当前安装根下有 `.aipm-dist.incomplete` 就取其中记的备份目录；没有标记才读 `~/.ai-pm/update/history.jsonl`，只看 `install_dir` 等于当前安装 `pwd -P` 的行，取最后一条还没被回滚过的升级行的 `backup_dir`——`action` 为 `rollback` 的行跳过，`backup_dir` 出现在后面某条 rollback 行里的升级行也跳过（那一轮已经退过了）。中断的升级还没写留痕，所以标记优先。然后：把备份里的受管文件写回原路径；仅当 `<backup_dir>/aipm-dist.old` 存在时才换 `.aipm-dist`——先把当前的 `.aipm-dist/`（若有）挪进一个新的备份目录，再 `mv <backup_dir>/aipm-dist.old .aipm-dist`；`aipm-dist.old` 不存在说明切换还没发生，现有的 `.aipm-dist/` 仍是旧的，不要动；残留的 `.aipm-dist.new/` 挪进备份目录；向 `history.jsonl` 追加一行回滚留痕 `{"ts":"...","install_dir":"...","action":"rollback","backup_dir":"...","to_commit":"...","to_content_digest":"..."}`（`backup_dir` 是这次拿来恢复的备份目录；`to_commit`、`to_content_digest` 取换回之后 `.aipm-dist/versions.json` 的 `commit`、`content_digest`，没有就不写这两项），这样覆盖检查读到的「最后一条记录」仍是真实状态；最后把 `.aipm-dist.incomplete` 挪进备份目录。

- 只回滚最后**一轮**。要退到更早的版本，连续执行，或按时间戳指定备份目录。
- `.aipm-dist/` 随之换回，base 也就退回到那一轮之前；漏换会让下一轮拿错基线。
- 备份目录缺文件或 `history.jsonl` 没有可读行时，如实说"回滚不了、缺什么"，不要用当前目录内容顶替。

## `--dry-run`

只跑阶段 0–2，出计划书。不备份、不写 `.aipm-dist.incomplete`、不落盘、不写 `history.jsonl`。
结束语必须点明"这是预览，没有动过任何文件"。

## 中断保护

阶段 3 开始前在当前安装根下写 `.aipm-dist.incomplete`，内容含时间戳、备份目录路径、`install_dir`。标记放在各自安装里，一台机器装多份 AI_PM 时互不覆盖。阶段 3 正常结束、`.aipm-dist/` 切换完成且 `history.jsonl` 留痕写完后，才把它 `mv` 进本轮备份目录（技能没有删除权限）。

下次启动见到 `.aipm-dist.incomplete`：**先提示用户有未完成的升级，问是否 rollback**，在用户答复前不进入新的升级。中途失败同理——标记不挪、不假装成功；能回到一致状态就回，回不去就如实说明停在哪个文件。M ≠ 0 不算中断：切换照常完成、标记照常挪走，没落定的文件留在 `base.json` 里等续跑。

## 输出前守门

- 对账行的 M 不为 0 时，有没有说"未完成"而不是"已完成"？
- 每个 `conflict` 有没有附第四种方案，而不是替用户在 ours / theirs 之间选？
- 结构化文件的合并产物有没有校验过就落盘？（没校验就落 = 可能悄悄废掉 hook）
- 知识库卡片有没有刷过 `last-verified`？合并动作本身不是核实。
- base 有没有按文件推进？只推进了已落定的文件吗？（全推 = 丢官方改动；不推 = 下一轮静默重复插入）走保守路径的文件标了 `held`、在报告里列给用户了吗？
- 说「新包可以删掉」之前，M 和 N 是不是都为 0？
- `.aipm-dist/` 是先写 `.aipm-dist.new/`、旧的挪成 `aipm-dist.old`、再切换的吗？
