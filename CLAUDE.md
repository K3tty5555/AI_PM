# AI_PM

Claude Code 的产品经理技能集合，输入需求自动完成分析、PRD、原型、评审全流程。

## 这是什么

AI_PM 是一组运行在 Claude Code 上的技能（Skills），面向产品经理日常工作场景。输入一句需求描述，自动完成竞品研究、用户故事拆解、PRD 撰写、原型设计和九角色评审。支持多项目并行管理和断点续传，不同项目的输出文件相互隔离。项目根目录下有 `AI_PM_教程中心.html`，用浏览器打开可查看所有功能的可视化使用指南。

## 快速开始

**前置条件：** 已安装 [Claude Code](https://claude.ai/code)

```bash
# 1. 克隆项目
git clone <repo-url>
cd AI_PM

# 2. 在 Claude Code 中打开项目目录
# File > Open Folder，选择 AI_PM 目录

# 3. 开始使用
/ai-pm
```

## 项目结构

```
.claude/                   Claude 配置（技能、Hooks、权限设置）
output/                    项目输出（不纳入版本库）
templates/                 模板库（PRD 风格、设计规范等）
AI_PM_教程中心.html          可视化使用指南，直接用浏览器打开
CLAUDE.md                  本文件
README.md                  项目介绍
```

## 技能速查

| 命令 | 场景 |
|------|------|
| `/ai-pm [需求]` | 完整产品流程（需求→PRD→原型） |
| `/ai-pm --team [需求]` | 复杂需求，启用多代理协作 |
| `/ai-pm priority` | 需求优先级评估（批量处理提报需求） |
| `/ai-pm weekly` | 生成工作周报 |
| `/ai-pm interview` | 现场调研/客户访谈模式 |
| `/ai-pm data [文件]` | 数据洞察分析 |
| `/ai-pm persona` | 产品分身（学习你的写作风格） |
| `/ai-pm design-spec` | 设计规范（加载公司/团队 UI 规范） |
| `/ai-pm knowledge` | 知识库管理 |

## 强制规范（Claude 必须遵守）

- UI/HTML 输出强制遵循 Apple HIG：`-apple-system, PingFang SC`，`#f5f5f7` 背景
- 数据分析 Excel 文件必须用 `openpyxl data_only=True`
- Chart.js `indexAxis:'y'` 必须在 `options` 顶层，不能放在 `scales` 里
- 所有项目文件输出到 `output/projects/{项目名}/`，不在该目录外新建子目录
- 交互文案须经 Humanizer-zh 处理，避免 AI 味

### Playwright MCP 使用规范

- Playwright MCP 配置为 headless Chromium（后台无界面运行），无需启动本地 HTTP 服务器
- 查看原生 HTML 文件直接用 `file:///绝对路径/文件名.html`，不需要 `python3 -m http.server`
- 截图/DOM 验证优先用 `browser_run_code` + `page.evaluate()` 而非 `browser_take_screenshot`（后者等待字体加载易超时）

## 禁止事项

- 不自动 git commit/push，除非用户明确要求
- 不跳过 git hooks（--no-verify）
- 不在 output/ 以外的地方生成项目文件
