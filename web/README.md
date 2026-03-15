# AI PM Web

AI PM 的 Web 版本 — 基于 Next.js 构建的产品经理 AI 工作台。

输入一句需求描述，自动完成需求分析、用户故事拆解、PRD 撰写全流程。每个项目拥有独立的输出目录和阶段管理，支持断点续传。

## 与 AI_PM 的关系

[AI_PM](https://github.com/user/AI_PM) 是运行在 Claude Code CLI 上的技能集合，面向终端用户。本项目（AI PM Web）将同样的产品流程搬到了浏览器中，提供可视化的项目管理界面和实时 AI 对话体验。

## 前置条件

- **Node.js 18+**
- **Claude API Key**（Anthropic 官方 Key）或兼容的代理服务地址

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，在「设置」页面填写 API Key 即可开始使用。

也可以通过环境变量配置：

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_BASE_URL=https://your-proxy.com  # 可选，使用代理时填写
ANTHROPIC_MODEL=claude-sonnet-4-6          # 可选，默认 claude-sonnet-4-6
```

## 技术栈

- **框架**: Next.js 16 (App Router, Turbopack)
- **数据库**: SQLite (better-sqlite3 + Drizzle ORM)
- **AI**: Anthropic Claude API (流式输出)
- **UI**: Tailwind CSS 4 + shadcn/ui，终末地设计系统（直角、#fffa00 主色调、monospace HUD 标签）
- **编辑器**: TipTap (富文本需求输入)
- **图表**: Mermaid (PRD 内流程图渲染)

## 项目结构

```
app/                    Next.js App Router 页面
  (dashboard)/          仪表盘（项目列表）
  project/[id]/         项目详情（需求→分析→故事→PRD）
  settings/             API 配置
  api/                  API Routes
components/             UI 组件
hooks/                  React Hooks
lib/                    工具库（DB、AI 客户端、文件管理）
data/                   SQLite 数据库（运行时生成，不入版本库）
output/                 项目输出文件
```

## 常用命令

```bash
npm run dev        # 开发服务器
npm run build      # 生产构建
npm run test:run   # 运行测试
npm run lint       # ESLint 检查
```
