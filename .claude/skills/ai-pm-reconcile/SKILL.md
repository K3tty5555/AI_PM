---
name: ai-pm-reconcile
description: >-
  跨产物一致性检查技能。读取项目事实基线和 _status.json 产物注册表，在需求新增、删除、改名、指标口径变化、PRD/原型/云文档人工修改后，或进入评审、验收、发布前，生成只读影响预览并找出 PRD、原型、评审、验收、指标和发布材料中的残留、冲突、未决项与覆盖缺口。当用户说「同步检查」「影响了哪些文档」「范围删了还有没有残留」「改完 PRD 其他地方要不要改」「reconcile」「跨产物对齐」「一致性检查」时使用。不负责自动批量改写；首版只读 preview，修改交回各产物 owner skill。
---

# 跨产物一致性检查

## 核心边界

- 只做 preview，不修改 PRD、原型、云文档、`_status.json` 或 memory。
- “列全影响”只承诺 `_status.json.artifacts` 已登记范围；未登记文件必须显示 `coverage-gap`。
- mode 是用户意图门面，不修改 `last_phase`、checkpoint 或 phase 完成状态。
- 云文档只通过现有 `prd_pull / prd_publish` 适配器核实；本技能不实现块级写入。

## 执行流程

1. 解析项目目录，读取 `_status.json`、`01-baseline-manifest.json` 和 `01-baseline-delta.md`（存在时）。
2. 运行契约检查：

   ```bash
   python3 scripts/aipm_contracts.py project --project "<项目目录>"
   ```

3. 若 baseline/artifacts 尚未登记，先生成零写预览：

   ```bash
   python3 scripts/aipm_contracts.py bootstrap --project "<项目目录>" --type iteration
   ```

   `bootstrap` 只发现候选来源和产物，不能替 PM 填 claim、依赖和权威源。只有用户明确确认时才追加 `--apply`；写入后的空 claims 仍不能通过迭代项目 baseline gate。

4. 确认高风险 claim 有来源，removed/changed claim 有可扫描 aliases，产物 dependencies 使用稳定 claim ID。
5. 运行只读预览：

   ```bash
   python3 scripts/aipm_reconcile.py --project "<项目目录>"
   ```

6. 按五态呈现：
   - `aligned`：已登记产物与当前范围一致。
   - `stale`：已删除范围或旧口径仍有残留。
   - `conflict`：项目契约或权威源互相冲突。
   - `pending-decision`：证据不足，必须让用户决定。
   - `coverage-gap`：发现产物但未登记，或登记目标不可核实；不计入通过。
7. 用户选择处理项后，分别调用 PRD、prototype、acceptance、data 或云文档适配器修改；全部完成后再次运行 preview。

## 输出要求

先给一句总体判断，再按严重度列：

1. 必须处理的 `stale / conflict`。
2. 需要用户拍板的 `pending-decision`。
3. 尚未纳入承诺范围的 `coverage-gap`。
4. 已对齐数量和本次扫描边界。

每条必须包含产物路径、claim ID 或命中词、依据和解除动作。不要把“脚本退出 0”说成“所有产物一致”；默认 preview 即使发现问题也退出 0，自动门禁需显式加 `--strict`。

详细字段与维护规则见 `references/contracts.md`。
