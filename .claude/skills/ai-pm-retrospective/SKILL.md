---
name: ai-pm-retrospective
description: >-
  复盘技能。默认在项目完成后基于全流程产出物总结决策、经验和改进点；当用户说「系统复盘」「复盘 AI_PM 自己」「看跨会话纠错」「检查对话覆盖」「retrospective --system」时进入工作区治理模式，只读脱敏会话摘要和索引，检查时间水位、摘要缺口、纠错候选与能力问题，不复制 raw、不直接覆盖项目 memory。
argument-hint: "[项目目录路径]"
allowed-tools: Read Write Edit Bash(mkdir)
---

# 项目复盘

## 模式分流

- `/ai-pm retrospective`：执行下方项目复盘，产出 `10-retrospective.md`。
- `/ai-pm retrospective --system --from YYYY-MM-DD --to YYYY-MM-DD`：执行系统复盘，不进入项目 Phase 9，不修改 `last_phase`。

## System 模式

1. 要求明确目标起止日期；“最近一段时间”先换算成日期并展示。
2. 默认读取 Claude + Codex 的 `.ai-shared/conversations/index.jsonl` 与脱敏 summaries，不读取或复制 raw。
3. 运行只读预览：

   ```bash
   python3 scripts/aipm_system_retrospective.py --from YYYY-MM-DD --to YYYY-MM-DD
   ```

4. 报告必须同时呈现：索引最早/最晚水位、缺失月份、目标会话数、summary missing、draft 数、纠错候选信号和数据边界。
5. `index-bounds-complete` 只表示时间边界和月份有会话，不代表摘要内容完整；不能因索引文件 mtime 新就声称目标月份已覆盖。
6. 关键词命中只是待核候选。需要形成规则或 skill 改动时，先写 `.ai-shared/pending-memory/` 候选并让用户确认，不直接覆盖 Claude memory 或项目 L0/L1。
7. 用户要求把报告落盘时，写本机 docs 或 pending-memory；默认只在对话展示。

System 模式到此结束，不继续执行下方项目复盘模板。

## 输入

基于项目全流程产出物（已在上下文中提供）：
- 需求草稿（01-requirement-draft.md）
- 需求分析（02-analysis-report/ 最新 V）
- PRD（当前 PRD，`05-prd/<当前 PRD 文件>`）
- 评审报告（08-reviews/ 最新一份）

## 输出

输出结构化的复盘报告，格式如下：

```markdown
# 项目复盘报告 - {项目名}

## 一、项目概述
- 产品名称：
- 核心目标：
- 评审结论：

## 二、流程复盘
| 阶段 | 评估 | 备注 |
|------|------|------|
| 需求收集 | ✓顺畅 / ⚠️有阻塞 / ✗较慢 | |
| 需求分析 | | |
| 竞品研究 | | |
| 用户故事 | | |
| PRD 撰写 | | |
| 需求评审 | | |

## 三、决策回顾
{3-5个关键决策点及事后评估}

## 四、经验总结
### 做得好的地方
{继续保持的实践}

### 改进建议
{下次可以做得更好的地方}

## 五、可复用产品资产
{可提炼为模板或方法论的内容}

## 六、知识库推荐沉淀
{建议存入知识库的条目，格式：- [分类] 标题：一句话摘要}
```

## 执行规则

1. 基于实际内容分析，不要假设或凭空填写
2. 知识库推荐条目格式：`- [分类] 标题：一句话摘要`
3. 语气专业务实，避免套话
4. 若某个输入文件不存在（如项目未完成某阶段），该阶段标为「未执行」
