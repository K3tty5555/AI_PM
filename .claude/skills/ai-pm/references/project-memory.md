# 项目记忆系统规范

## 目录结构

每个项目的 `_memory/` 目录包含：

```
_memory/
  L0-identity.md      # 产品定位、目标用户、核心约束（~100 tokens，常驻加载）
  L1-decisions.md     # 关键决策 + why + 时间戳（~300 tokens，常驻加载）
  L2-analysis.md      # 分析/竞品阶段专属上下文（按需加载）
  L2-prototype.md     # 原型阶段设计选择 + 待验证假设（按需加载）
  layout-shell.md     # 代码仓提取的布局结构（原型专用，首次 --codebase 时生成）
```

## _memory/ 与 _summaries/ 信息边界

| 目录 | 用途 | 可写 | 加载时机 |
|------|------|------|---------|
| `_summaries/` | token 压缩——大 PRD 的只读摘要，供后续 phase 快速读取完整 PRD 时用 | 否（只生成，不追加） | 同 phase 内按需 |
| `_memory/` | 跨会话上下文恢复——可写的决策日志和设计记录 | 是（追加写入） | continue 时加载 |

**不允许两个目录互相复制内容**。`_summaries/prd-summary.md` 中的"关键设计决策"不写入 L1，L1 的来源只有 Phase 5 执行时主动提取的取舍决策。

## 初始化

新项目创建时（`/ai-pm new` 或第一个 phase 开始前），执行：

```bash
mkdir -p {project_dir}/_memory/
```

若用 `--preset=xxx` 创建：
0. **前置校验**：先用 `test -f templates/presets/{预设名}.md` 检查文件是否存在。若不存在，**立即报错并列出可用预设**（`ls templates/presets/*.md`），不降级、不静默跳过：
   ```
   错误：预设 "{预设名}" 不存在。
   可用预设：{列出文件名，去掉 .md 后缀}
   ```
1. 读取 `templates/presets/{预设名}.md`
2. 复制其全部内容写入 `_memory/L0-identity.md`（不是引用，是复制）
3. 在终端提示：**"已复制预设内容到 {项目名}/_memory/L0-identity.md，后续修改预设文件不影响此项目。"**
4. 创建空的 `_memory/L1-decisions.md`（内容只含 `# {项目名} · 关键决策` 标题行）

若不用 preset：
1. 不预先创建 L0/L1（留给对应 phase 写入）

## L0-identity.md 格式

产品定位、目标用户、核心约束，总量控制在 ~100 tokens（约 400 字）。

```markdown
# {项目名} · 产品身份

## 产品定位
{一句话：为谁解决什么问题}

## 目标用户
{用户角色、使用场景}

## 技术栈
{前端/后端/主要框架}

## 设计 Token
{主色值、辅助色等}

## 核心约束
{必须遵守的红线、禁止项}

## 业务域
{所属产品线/系统背景}
```

**更新时机**：Phase 1（需求澄清）完成后，根据 01-requirement-draft.md 填充/更新。

## L1-decisions.md 格式

关键功能决策，采用**追加不覆盖**原则。变更时用 `~~superseded~~` 标记旧记录。

**"一条"的定义**：以 `## YYYY-MM-DD: <标题>` 格式的二级标题为单元起点，到下一个同级 `##` 标题之前的全部内容为一条。continue 时"读最近5条"即读最后5个此类块。

```markdown
# {项目名} · 关键决策

## 2026-04-11: 侧边栏 Copilot 替代弹窗
**决策**：分析结果展示改为侧边栏 Copilot 模式
**原因**：弹窗打断操作流，教师反馈负面
**范围**：学情分析页、考后报告页

---

## 2026-03-10: ~~弹窗展示分析结果~~ ← superseded by 2026-04-11
```

**更新时机**：Phase 5（PRD）落盘后，提取「功能规格」中的关键取舍写入。

## L2-{phase}.md 格式

各阶段专属上下文，按需加载（只在对应 phase 时加载）。

### L2-analysis.md（Phase 2/3 完成后写入）

```markdown
# {项目名} · 分析洞察

## 核心用户痛点（Top 3）
1. {痛点1}
2. {痛点2}
3. {痛点3}

## 竞品差异点
- {竞品A}：{优势/不足}
- {竞品B}：{优势/不足}

## 我们的差异化机会
{1-2 句话}
```

### L2-prototype.md（Phase 7 完成后写入）

```markdown
# {项目名} · 原型设计记录

## 设计选择
- UI Shell：{套用了哪个真实 layout / AI 自行生成}
- 色值来源：{使用了 layout-shell.md 中的真实色值 / preset 色值 / AI 推断}
- 主要交互模式：{弹窗 / 侧边栏 / 页面跳转 等}

## 关键页面说明
- {页面名}：{设计意图}

## 待验证假设
- {假设1}：{需要通过用户测试验证的点}
- {假设2}：...
```

## layout-shell.md 格式（B 方向专用）

由 `/ai-pm prototype --codebase=` 命令触发生成，描述从代码仓提取的设计指纹。

若提取完全失败，文件内容为：`status: failed`（用于防止被误判为有效缓存）。

```markdown
# {项目名} · 布局指纹

> 提取自：{代码仓路径}
> 提取时间：{YYYY-MM-DD HH:MM}
> status: ok  （或 failed / partial）

## 设计 Token / 色值
```css
/* 来源：{相对路径}/css-var.scss（或同等文件）*/
--primary-color: #05C1AE;
--error-color: #F45454;
--warning-color: #F6B54E;
--success-color: #33A3EE;
/* ... 其他找到的 CSS 变量 */
```

## 主布局结构
{文字描述：如「顶部导航（60px）+ 左侧边栏（220px，含二级菜单）+ 右侧内容区 + 底部无」}
主要交互区域：{tab-bar 位置、agent panel 位置等}

## 路由页面列表
- {路由路径}：{页面名/功能描述}
（列出从路由文件提取的主要路由，最多 20 条）

## 核心 UI 组件模式
组件名：{文件名}
Props：{关键 props 类型声明}
结构：{根元素直接子元素，不超过 10 行}
```

## /ai-pm continue 读取规范

执行 `/ai-pm continue` 时，除读取 `_status.json` 外，额外执行记忆加载：

1. **固定加载**：用 `test -f` 检查，若 `_memory/L0-identity.md` 存在，读取全文；不存在则静默跳过（不报错）
2. **固定加载**：用 `test -f` 检查，若 `_memory/L1-decisions.md` 存在，读取最近 5 条决策
   - "一条"的边界：以 `## YYYY-MM-DD` 格式的二级标题为单元，读取该标题至下一个同级标题之间的全部内容
3. **按需加载**：先**确认用户即将执行的阶段**（通过 pending_step 或用户输入），再加载对应 `L2-{phase}.md`（`last_phase` 仅作 fallback 推断）：
   - 目标阶段为 `analysis` / `competitor` → 用 `test -f` 检查加载 `L2-analysis.md`
   - 目标阶段为 `prototype` → 用 `test -f` 检查加载 `L2-prototype.md`
4. **按需加载**：若 `_memory/layout-shell.md` 存在（`test -f`）且目标阶段为 `prototype` → 加载
5. **任何 test -f 失败均静默跳过，不报错，不中断 continue 流程**

**输出格式**（输出后直接进入工作，不再追问背景）：

```
── 项目：{项目名} · 恢复上下文 ──

产品：{L0「产品定位」内容，一句话}
上次完成：{last_phase 中文名}（{_status.json.updated 的日期部分}）
当前阶段：{推荐下一步}

关键决策：
· {L1 最近 3 条决策，每条一行标题}

遗留问题：
· {L2 中的「待验证假设」，若无则省略此节}

继续 {推荐下一步}？[Y/n]
```
