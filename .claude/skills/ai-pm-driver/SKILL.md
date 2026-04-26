---
name: ai-pm-driver
description: >-
  PM 风格 lint 命令入口（评审前最后一道关）。
  本 skill 是 `pm-agent` 的 thin wrapper——接收 PRD 文件路径，调用 pm-agent 用 lint mode 扫描整份 PRD，输出 punch list（越界 + 缺失 + 篇幅）。
  与 `pm-agent` 的关系：driver = 命令糖衣 / pm-agent = 真正的判断引擎。判断卡 / 反例 / 越界规则单一事实源在 pm-agent，driver 不重复维护。
  与 `ai-pm-review`（六角色评审会）和 `multi-perspective-review`（多视角技术审查）的区别：driver 是 PM 个人风格 lint，5 分钟出结论。
  当用户说「PM 守门」「审视 PRD」「PRD 挑刺」「PRD 越界检查」「driver 一下」「PRD 自审」「评审前体检」「历史 PRD 回归」时，使用此 skill。
argument-hint: "[PRD 文件路径，默认读项目最新 05-prd/ 下的 .md]"
allowed-tools: Read Bash(wc) Bash(ls) Glob
---

## 执行流程（30 行 thin wrapper）

### Step 1: 找 PRD 文件

用户提供路径 → 直接用。
没提供路径 → 自动找项目最新 PRD：

```bash
ls -t output/projects/*/05-prd/*.md 2>/dev/null | head -3
```

找到多个时列出让用户选；找到 0 个时提示用户提供路径。

### Step 2: 调用 pm-agent 做 lint

用 Agent 工具调用 pm-agent，传 lint mode prompt：

```
Agent({
  description: "PM 风格 lint：审视 PRD",
  subagent_type: "pm-agent",
  prompt: """
任务：审视下列 PRD 文件，按 9 项自检 + 6 越界红线扫描，输出 punch list。

PRD 文件路径：{prd_file_path}

要求：
1. 读 PRD 全文（用 Read 工具，记录行号）
2. 按 9 项 checklist 逐项扫，列出不通过项（行号 + 原文 + 修改建议）
3. 检查越界红线（技术栈 / 接口字段 / 视觉毫秒 / 算法实现 / 给用户透版本号 / 过细异常）
4. 检查缺失项（复用对照表 / 影响范围 / 暂不纳入本期 / 责任分工 / 修订日志保留 PM-评审迭代）
5. Agent / hybrid 产品额外查 4 项（行为契约带理由 / Few-shot 标 [算法补完] / 评测用接受度信号 / 失败兜底用户感知 only）
6. 篇幅评估（KettyWu范本 V1.7=103 / V3=253；500+ 警戒）
7. 输出格式：先 ❌ 越界（必修，行号+建议），再 ⚠️ 缺失（建议补），再 ✅ 通过项，最后 🎯 总评（是否可进评审）

不要重写 PRD，只指出问题让 PM 修。
"""
})
```

### Step 3: 返回 pm-agent 的输出

pm-agent 的 punch list 直接呈现给用户，不二次加工。

---

## 为什么是 thin wrapper

判断卡 / 反例库 / 越界规则全部由 pm-agent 内化（`agents/pm-agent.md`）。driver 不重复维护这些规则——避免：
- ❌ pm-agent 更新一条规则，driver 忘了同步
- ❌ pm-agent 自检和 driver 扫描结论不一致

**真理一份**：所有 PM 风格判断逻辑都在 pm-agent。driver 只是个命令快捷入口。

## 触发时机

| 场景 | 用法 |
|------|------|
| 评审日早晨过一遍 | `/ai-pm driver [PRD路径]` |
| 历史 PRD 回归 | 同上 |
| 大改后体检 | 同上 |
| 第三方 PRD 接手 | 同上 |

**不该用**：
- ❌ pm-agent 刚写完的章节——已自检过 9 项，不重复跑
- ❌ 当 lint hook 用——driver 是 PM 主动审查，不是自动化

## 与其他评审 skill 的边界

| 工具 | 角色 | 时机 | 输出 |
|------|------|------|------|
| `pm-agent`（sub-agent，**真理一份**）| KettyWu 写/审 PRD | 写时主动调；审时 driver 调 | 章节内容 / punch list |
| **本 skill `ai-pm-driver`** | pm-agent 的 lint 命令糖衣 | 评审前/历史回归 | punch list |
| `ai-pm-review` | 六角色评审会 | 评审会现场 | 各角色立场意见 |
| `multi-perspective-review` | 设计/技术多视角 | 设计方案定稿前 | 多视角技术审视 |
