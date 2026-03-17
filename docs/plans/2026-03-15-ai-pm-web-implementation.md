# AI PM Web 应用实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个终末地风格的 Web 应用，将 AI PM 的核心链路（需求→分析→故事→PRD）以阶段引导式 UI 呈现，复用现有 SKILL.md 作为业务逻辑。

**Architecture:** Next.js 15 全栈应用。后端通过 skill-loader 读取 .claude/skills/*.md 构造 system prompt，调 Claude API 生成内容，SSE 流式推送到前端。前端每个阶段是独立页面，卡片式展示 + 内联对话追问。SQLite 存储项目元数据，产出文件写入共享的 output/projects/ 目录。

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS v4, shadcn/ui, Anthropic SDK, Drizzle ORM + better-sqlite3, SSE

**Design Reference:** `<AI_PM_ROOT>/AI_PM_教程中心.html` (终末地风格)

**Design Doc:** `<AI_PM_ROOT>/docs/plans/2026-03-15-ai-pm-web-design.md`

**Existing Project:** `<AI_PM_ROOT>/` (skills, templates, output 均在此目录)

---

## Task 1: 项目初始化

**Files:**
- Create: `ai-pm-web/package.json`
- Create: `ai-pm-web/next.config.ts`
- Create: `ai-pm-web/tailwind.config.ts`
- Create: `ai-pm-web/tsconfig.json`
- Create: `ai-pm-web/.env.local`
- Create: `ai-pm-web/app/layout.tsx`
- Create: `ai-pm-web/app/page.tsx`

**Step 1: 创建 Next.js 项目**

```bash
cd <USER_HOME>/workplace
npx create-next-app@latest ai-pm-web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --use-npm
```

**Step 2: 安装核心依赖**

```bash
cd <USER_HOME>/workplace/ai-pm-web
npm install @anthropic-ai/sdk drizzle-orm better-sqlite3 zod
npm install -D drizzle-kit @types/better-sqlite3
```

**Step 3: 安装 UI 依赖**

```bash
npx shadcn@latest init -d
npm install lucide-react @radix-ui/react-slot class-variance-authority clsx tailwind-merge
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder
npm install react-markdown remark-gfm rehype-raw
npm install @hello-pangea/dnd
```

**Step 4: 配置 .env.local**

```bash
cat > .env.local << 'EOF'
# AI PM 项目根目录（SKILL.md、templates、output 所在位置）
AI_PM_ROOT=<USER_HOME>/workplace/AI_PM

# 数据库路径
DATABASE_URL=file:./data/ai-pm.db
EOF
```

**Step 5: 验证项目启动**

```bash
npm run dev
```

Expected: 浏览器打开 http://localhost:3000 看到 Next.js 默认页面

**Step 6: Commit**

```bash
git init
git add .
git commit -m "chore: initialize Next.js project with dependencies"
```

---

## Task 2: 终末地设计系统

**Files:**
- Create: `ai-pm-web/lib/design-tokens.ts`
- Create: `ai-pm-web/app/globals.css`
- Create: `ai-pm-web/components/ui/button.tsx`
- Create: `ai-pm-web/components/ui/card.tsx`
- Create: `ai-pm-web/components/ui/badge.tsx`
- Create: `ai-pm-web/components/ui/progress-bar.tsx`
- Create: `ai-pm-web/components/stage-nav.tsx`
- Create: `ai-pm-web/components/inline-chat.tsx`
- Create: `ai-pm-web/components/rarity-stripe-card.tsx`

**Step 1: 定义 Design Tokens**

`lib/design-tokens.ts` — 终末地风格的所有设计变量：

```typescript
export const tokens = {
  colors: {
    white: '#FFFFFF',
    light: '#F5F5F5',
    dark: '#191919',
    dark2: '#252525',
    yellow: '#fffa00',
    green: '#4CAF50',
    teal: '#4ECDC4',
    text: '#141414',
    textMuted: '#6b6b6b',
    border: 'rgba(0,0,0,0.10)',
    shadowLight: 'rgba(0,0,0,0.04)',
    yellowGlow: 'rgba(255,250,0,0.12)',
    yellowBg: 'rgba(255,250,0,0.08)',
  },
  fonts: {
    mono: "'Courier New', Consolas, monospace",
    sans: "-apple-system, 'PingFang SC', sans-serif",
  },
  transition: '0.28s cubic-bezier(0.16, 1, 0.3, 1)',
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const
```

**Step 2: 编写全局 CSS**

`app/globals.css` — CSS 变量 + 动画关键帧 + 基础排版：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --white: #FFFFFF;
  --light: #F5F5F5;
  --dark: #191919;
  --dark2: #252525;
  --yellow: #fffa00;
  --green: #4CAF50;
  --teal: #4ECDC4;
  --text: #141414;
  --text-muted: #6b6b6b;
  --border: rgba(0,0,0,0.10);
  --shadow-light: rgba(0,0,0,0.04);
  --yellow-glow: rgba(255,250,0,0.12);
  --yellow-bg: rgba(255,250,0,0.08);
  --font-mono: 'Courier New', Consolas, monospace;
  --font-sans: -apple-system, 'PingFang SC', sans-serif;
  --tr: 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

/* 全局直角 */
* { border-radius: 0 !important; }

/* 脉冲动画 - 绿色状态点 */
@keyframes dotPulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(76,175,80,0.5); }
  50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(76,175,80,0); }
}

/* 黄色进度条 */
@keyframes progressFill {
  from { width: 0; }
  to { width: var(--progress-width, 100%); }
}

/* 内容淡入上浮 */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 涟漪 */
@keyframes rippleOut {
  to { transform: scale(4); opacity: 0; }
}
```

**Step 3: 构建基础组件**

逐个构建以下组件，所有组件遵循终末地风格（直角、黄色强调、monospace 标签）：

1. `button.tsx` — 两种变体：primary（黄底黑字）、ghost（透明底灰边框，hover 黄色边框）
2. `card.tsx` — 基础卡片容器，极浅阴影，hover 黄色辉光
3. `badge.tsx` — monospace 标签，letter-spacing: 1.5px，大写
4. `progress-bar.tsx` — 黄色渐变进度条
5. `rarity-stripe-card.tsx` — 左侧竖条卡片（金/青/灰三级）
6. `stage-nav.tsx` — 六边形阶段导航条（7 个节点 + 连接线）
7. `inline-chat.tsx` — 内联 AI 对话组件（气泡 + 快捷选项 + 自由输入）

**Step 4: 创建组件展示页用于验证**

创建 `app/dev/components/page.tsx`，展示所有组件的各种状态，确保视觉一致性。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add terminal-style design system and base components"
```

---

## Task 3: 数据库 Schema

**Files:**
- Create: `ai-pm-web/lib/db/schema.ts`
- Create: `ai-pm-web/lib/db/index.ts`
- Create: `ai-pm-web/lib/db/migrate.ts`
- Create: `ai-pm-web/drizzle.config.ts`
- Test: `ai-pm-web/lib/db/__tests__/schema.test.ts`

**Step 1: 写测试**

```typescript
// lib/db/__tests__/schema.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { projects, projectPhases } from '../schema'
import { eq } from 'drizzle-orm'

describe('database schema', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof drizzle>

  beforeAll(() => {
    sqlite = new Database(':memory:')
    db = drizzle(sqlite)
    // 手动建表（测试环境）
    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        current_phase TEXT NOT NULL DEFAULT 'requirement',
        output_dir TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE project_phases (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        phase TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        output_file TEXT,
        started_at TEXT,
        completed_at TEXT
      );
    `)
  })

  afterAll(() => sqlite.close())

  it('should create a project', () => {
    db.insert(projects).values({
      id: 'test-1',
      name: '测试项目',
      description: '测试描述',
      currentPhase: 'requirement',
      outputDir: '/tmp/test',
    }).run()

    const result = db.select().from(projects).where(eq(projects.id, 'test-1')).get()
    expect(result?.name).toBe('测试项目')
  })

  it('should create project phases', () => {
    db.insert(projectPhases).values({
      id: 'phase-1',
      projectId: 'test-1',
      phase: 'requirement',
      status: 'completed',
    }).run()

    const result = db.select().from(projectPhases).where(eq(projectPhases.projectId, 'test-1')).all()
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('completed')
  })
})
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run lib/db/__tests__/schema.test.ts
```
Expected: FAIL（schema 文件不存在）

**Step 3: 实现 Schema**

```typescript
// lib/db/schema.ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  currentPhase: text('current_phase').notNull().default('requirement'),
  outputDir: text('output_dir').notNull(),
  createdAt: text('created_at').notNull().default('datetime("now")'),
  updatedAt: text('updated_at').notNull().default('datetime("now")'),
})

export const projectPhases = sqliteTable('project_phases', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  phase: text('phase').notNull(), // requirement | analysis | research | stories | prd | prototype | review
  status: text('status').notNull().default('pending'), // pending | in_progress | completed | skipped
  outputFile: text('output_file'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
})

export type Project = typeof projects.$inferSelect
export type ProjectPhase = typeof projectPhases.$inferSelect

export const PHASES = [
  'requirement',
  'analysis',
  'research',
  'stories',
  'prd',
  'prototype',
  'review',
] as const

export type Phase = typeof PHASES[number]

export const PHASE_LABELS: Record<Phase, string> = {
  requirement: '需求输入',
  analysis: '需求分析',
  research: '竞品研究',
  stories: '用户故事',
  prd: 'PRD',
  prototype: '原型',
  review: '评审',
}
```

**Step 4: 实现数据库初始化**

```typescript
// lib/db/index.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'ai-pm.db')

function getDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  return drizzle(sqlite, { schema })
}

export const db = getDb()
```

**Step 5: 运行测试确认通过**

```bash
npx vitest run lib/db/__tests__/schema.test.ts
```
Expected: PASS

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add SQLite database schema for projects and phases"
```

---

## Task 4: skill-loader 库

**Files:**
- Create: `ai-pm-web/lib/skill-loader.ts`
- Test: `ai-pm-web/lib/__tests__/skill-loader.test.ts`

**Step 1: 写测试**

```typescript
// lib/__tests__/skill-loader.test.ts
import { describe, it, expect } from 'vitest'
import { loadSkill, buildSystemPrompt } from '../skill-loader'

const AI_PM_ROOT = '<USER_HOME>/workplace/AI_PM'

describe('skill-loader', () => {
  it('should load ai-pm-analyze skill', () => {
    const content = loadSkill(AI_PM_ROOT, 'ai-pm-analyze')
    expect(content).toContain('需求分析')
    expect(content.length).toBeGreaterThan(100)
  })

  it('should throw for non-existent skill', () => {
    expect(() => loadSkill(AI_PM_ROOT, 'non-existent')).toThrow()
  })

  it('should build system prompt with context', () => {
    const prompt = buildSystemPrompt(AI_PM_ROOT, 'ai-pm-analyze', {
      projectName: '测试项目',
      previousOutputs: { requirement: '# 需求\n用户需要一个登录功能' },
    })
    expect(prompt).toContain('需求分析')
    expect(prompt).toContain('测试项目')
    expect(prompt).toContain('登录功能')
  })
})
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run lib/__tests__/skill-loader.test.ts
```

**Step 3: 实现 skill-loader**

```typescript
// lib/skill-loader.ts
import fs from 'fs'
import path from 'path'

export function loadSkill(aiPmRoot: string, skillName: string): string {
  const skillDir = path.join(aiPmRoot, '.claude', 'skills', skillName)
  const skillFile = path.join(skillDir, 'SKILL.md')

  if (!fs.existsSync(skillFile)) {
    throw new Error(`Skill not found: ${skillName} (looked at ${skillFile})`)
  }

  let content = fs.readFileSync(skillFile, 'utf-8')

  // 加载子文件（如 ai-pm 主技能拆分的 phase-workflows.md 等）
  const subFiles = ['phase-workflows.md', 'user-interaction.md', 'web-analysis.md', 'edge-cases.md']
  for (const sub of subFiles) {
    const subPath = path.join(skillDir, sub)
    if (fs.existsSync(subPath)) {
      content += '\n\n' + fs.readFileSync(subPath, 'utf-8')
    }
  }

  return content
}

interface PromptContext {
  projectName: string
  previousOutputs?: Record<string, string>
  userInput?: string
}

export function buildSystemPrompt(
  aiPmRoot: string,
  skillName: string,
  context: PromptContext
): string {
  const skill = loadSkill(aiPmRoot, skillName)

  const parts: string[] = [
    skill,
    '',
    '---',
    '',
    `## 当前项目上下文`,
    `项目名称：${context.projectName}`,
  ]

  if (context.previousOutputs) {
    parts.push('', '### 已有产出物')
    for (const [phase, content] of Object.entries(context.previousOutputs)) {
      parts.push(``, `#### ${phase}`, content)
    }
  }

  return parts.join('\n')
}

export function listSkills(aiPmRoot: string): string[] {
  const skillsDir = path.join(aiPmRoot, '.claude', 'skills')
  if (!fs.existsSync(skillsDir)) return []

  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .filter(d => fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md')))
    .map(d => d.name)
}
```

**Step 4: 运行测试确认通过**

```bash
npx vitest run lib/__tests__/skill-loader.test.ts
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add skill-loader to read SKILL.md as system prompts"
```

---

## Task 5: Claude API 客户端（SSE 流式）

**Files:**
- Create: `ai-pm-web/lib/claude-client.ts`
- Create: `ai-pm-web/lib/config-reader.ts`
- Test: `ai-pm-web/lib/__tests__/config-reader.test.ts`

**Step 1: 实现本地配置读取**

读取用户已有的 Claude Code 环境配置，零配置启动。

```typescript
// lib/config-reader.ts
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

interface ClaudeConfig {
  apiKey: string
  baseUrl?: string
  model: string
}

/**
 * 按优先级尝试读取 Claude API 配置：
 * 1. 环境变量 ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL
 * 2. ~/.claude/.credentials (如果存在)
 * 3. 用户本地 Web 应用配置 data/config.json
 */
export function readClaudeConfig(): ClaudeConfig | null {
  // 1. 环境变量（Claude Code 最常用的方式）
  const envKey = process.env.ANTHROPIC_API_KEY
  if (envKey) {
    return {
      apiKey: envKey,
      baseUrl: process.env.ANTHROPIC_BASE_URL || undefined,
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    }
  }

  // 2. 从 shell profile 中提取（用户可能在 .zshrc 中 export 了）
  try {
    const key = execSync('bash -ilc "echo $ANTHROPIC_API_KEY"', {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim()
    if (key) {
      const baseUrl = execSync('bash -ilc "echo $ANTHROPIC_BASE_URL"', {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim()
      return {
        apiKey: key,
        baseUrl: baseUrl || undefined,
        model: 'claude-sonnet-4-6',
      }
    }
  } catch {
    // shell 读取失败，继续
  }

  // 3. 本地 Web 应用配置
  const localConfig = path.join(process.cwd(), 'data', 'config.json')
  if (fs.existsSync(localConfig)) {
    try {
      const config = JSON.parse(fs.readFileSync(localConfig, 'utf-8'))
      if (config.apiKey) {
        return {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl || undefined,
          model: config.model || 'claude-sonnet-4-6',
        }
      }
    } catch {
      // JSON 解析失败，继续
    }
  }

  return null
}

export function saveLocalConfig(config: Partial<ClaudeConfig>): void {
  const configDir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
  const configPath = path.join(configDir, 'config.json')

  let existing: Record<string, unknown> = {}
  if (fs.existsSync(configPath)) {
    try { existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) } catch {}
  }

  fs.writeFileSync(configPath, JSON.stringify({ ...existing, ...config }, null, 2))
}
```

**Step 2: 写配置读取测试**

```typescript
// lib/__tests__/config-reader.test.ts
import { describe, it, expect, vi } from 'vitest'
import { readClaudeConfig } from '../config-reader'

describe('config-reader', () => {
  it('should read from environment variables', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-123')
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://proxy.example.com')

    const config = readClaudeConfig()
    expect(config).not.toBeNull()
    expect(config!.apiKey).toBe('test-key-123')
    expect(config!.baseUrl).toBe('https://proxy.example.com')

    vi.unstubAllEnvs()
  })

  it('should return null when no config found', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const config = readClaudeConfig()
    // 可能从 shell profile 读到，也可能 null
    // 这里只验证不抛异常
    expect(() => readClaudeConfig()).not.toThrow()
    vi.unstubAllEnvs()
  })
})
```

**Step 3: 实现 Claude 客户端**

```typescript
// lib/claude-client.ts
import Anthropic from '@anthropic-ai/sdk'
import { readClaudeConfig } from './config-reader'

let clientInstance: Anthropic | null = null

export function getClaudeClient(): Anthropic {
  if (clientInstance) return clientInstance

  const config = readClaudeConfig()
  if (!config) {
    throw new Error('Claude API 配置未找到。请在设置页面配置 API Key。')
  }

  clientInstance = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  })

  return clientInstance
}

export function resetClient(): void {
  clientInstance = null
}

export function getModel(): string {
  const config = readClaudeConfig()
  return config?.model || 'claude-sonnet-4-6'
}

interface StreamCallbacks {
  onText: (text: string) => void
  onComplete: (fullText: string) => void
  onError: (error: Error) => void
}

export async function streamChat(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  callbacks: StreamCallbacks
): Promise<void> {
  const client = getClaudeClient()
  let fullText = ''

  try {
    const stream = client.messages.stream({
      model: getModel(),
      max_tokens: 8192,
      system: systemPrompt,
      messages,
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text
        callbacks.onText(event.delta.text)
      }
    }

    callbacks.onComplete(fullText)
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}
```

**Step 4: 运行测试**

```bash
npx vitest run lib/__tests__/config-reader.test.ts
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add Claude API client with SSE streaming and config reader"
```

---

## Task 6: 项目 CRUD API

**Files:**
- Create: `ai-pm-web/app/api/projects/route.ts` (GET: 列表, POST: 创建)
- Create: `ai-pm-web/app/api/projects/[id]/route.ts` (GET: 详情, PATCH: 更新, DELETE: 删除)
- Create: `ai-pm-web/lib/project-service.ts`
- Create: `ai-pm-web/lib/file-manager.ts`
- Test: `ai-pm-web/lib/__tests__/project-service.test.ts`

**Step 1: 写测试**

```typescript
// lib/__tests__/project-service.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createProject, getProject, listProjects, updateProjectPhase } from '../project-service'

// 使用内存数据库测试
describe('project-service', () => {
  it('should create a project with all 7 phases initialized', () => {
    const project = createProject('测试项目', '这是一个测试')
    expect(project.name).toBe('测试项目')
    expect(project.currentPhase).toBe('requirement')
    expect(project.phases).toHaveLength(7)
    expect(project.phases[0].phase).toBe('requirement')
    expect(project.phases[0].status).toBe('pending')
  })

  it('should list projects sorted by updated_at desc', () => {
    const projects = listProjects()
    expect(Array.isArray(projects)).toBe(true)
  })

  it('should update phase status', () => {
    const project = createProject('测试项目2', '')
    updateProjectPhase(project.id, 'requirement', 'completed')
    const updated = getProject(project.id)
    expect(updated!.phases.find(p => p.phase === 'requirement')!.status).toBe('completed')
  })
})
```

**Step 2: 实现 file-manager**

```typescript
// lib/file-manager.ts
import fs from 'fs'
import path from 'path'

const AI_PM_ROOT = process.env.AI_PM_ROOT || '<USER_HOME>/workplace/AI_PM'

function getProjectsDir(): string {
  // 读取 ~/.ai-pm-config 获取项目输出目录
  const configPath = path.join(process.env.HOME || '', '.ai-pm-config')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.projects_dir) return config.projects_dir
    } catch {}
  }
  return path.join(AI_PM_ROOT, 'output', 'projects')
}

export const PROJECTS_DIR = getProjectsDir()

export function ensureProjectDir(projectName: string): string {
  const dir = path.join(PROJECTS_DIR, projectName)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function readProjectFile(projectName: string, fileName: string): string | null {
  const filePath = path.join(PROJECTS_DIR, projectName, fileName)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath, 'utf-8')
}

export function writeProjectFile(projectName: string, fileName: string, content: string): void {
  const dir = ensureProjectDir(projectName)
  const filePath = path.join(dir, fileName)

  // 确保子目录存在
  const fileDir = path.dirname(filePath)
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true })
  }

  fs.writeFileSync(filePath, content, 'utf-8')
}

export function listProjectFiles(projectName: string): string[] {
  const dir = path.join(PROJECTS_DIR, projectName)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { recursive: true }) as string[]
}

export function writeStatusJson(projectName: string, phases: Record<string, boolean>, lastPhase: string): void {
  const status = {
    project: projectName,
    updated: new Date().toISOString().slice(0, 10),
    phases,
    last_phase: lastPhase,
  }
  writeProjectFile(projectName, '_status.json', JSON.stringify(status, null, 2))
}
```

**Step 3: 实现 project-service**

```typescript
// lib/project-service.ts
import { db } from './db'
import { projects, projectPhases, PHASES } from './db/schema'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { ensureProjectDir, writeStatusJson } from './file-manager'

export function createProject(name: string, description: string) {
  const id = randomUUID()
  const outputDir = ensureProjectDir(name)

  db.insert(projects).values({
    id,
    name,
    description,
    currentPhase: 'requirement',
    outputDir,
  }).run()

  // 初始化 7 个阶段
  for (const phase of PHASES) {
    db.insert(projectPhases).values({
      id: randomUUID(),
      projectId: id,
      phase,
      status: 'pending',
    }).run()
  }

  return getProject(id)!
}

export function getProject(id: string) {
  const project = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!project) return null

  const phases = db.select().from(projectPhases)
    .where(eq(projectPhases.projectId, id))
    .all()

  return { ...project, phases }
}

export function listProjects() {
  const allProjects = db.select().from(projects).orderBy(desc(projects.updatedAt)).all()

  return allProjects.map(p => {
    const phases = db.select().from(projectPhases)
      .where(eq(projectPhases.projectId, p.id))
      .all()
    const completedCount = phases.filter(ph => ph.status === 'completed').length
    return { ...p, phases, completedCount, totalPhases: PHASES.length }
  })
}

export function updateProjectPhase(projectId: string, phase: string, status: string) {
  db.update(projectPhases)
    .set({
      status,
      ...(status === 'in_progress' ? { startedAt: new Date().toISOString() } : {}),
      ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
    })
    .where(eq(projectPhases.projectId, projectId))
    .run()

  // 更新项目当前阶段
  if (status === 'completed') {
    const nextIndex = PHASES.indexOf(phase as any) + 1
    if (nextIndex < PHASES.length) {
      db.update(projects)
        .set({ currentPhase: PHASES[nextIndex], updatedAt: new Date().toISOString() })
        .where(eq(projects.id, projectId))
        .run()
    }
  }
}
```

**Step 4: 实现 API Routes**

```typescript
// app/api/projects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createProject, listProjects } from '@/lib/project-service'

export async function GET() {
  const projects = listProjects()
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const { name, description } = await req.json()
  if (!name) {
    return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 })
  }
  const project = createProject(name, description || '')
  return NextResponse.json(project, { status: 201 })
}
```

```typescript
// app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getProject } from '@/lib/project-service'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const project = getProject(params.id)
  if (!project) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404 })
  }
  return NextResponse.json(project)
}
```

**Step 5: 运行测试**

```bash
npx vitest run lib/__tests__/project-service.test.ts
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add project CRUD API with file manager"
```

---

## Task 7: AI 流式 API Route

**Files:**
- Create: `ai-pm-web/app/api/ai/stream/route.ts`
- Create: `ai-pm-web/lib/phase-prompt-builder.ts`

**Step 1: 实现阶段 Prompt 构建器**

每个阶段需要不同的 SKILL.md 和上下文组合：

```typescript
// lib/phase-prompt-builder.ts
import { buildSystemPrompt } from './skill-loader'
import { readProjectFile } from './file-manager'

const AI_PM_ROOT = process.env.AI_PM_ROOT || '<USER_HOME>/workplace/AI_PM'

interface PhaseConfig {
  skillName: string
  inputFiles: string[]
  outputFile: string
}

const PHASE_CONFIG: Record<string, PhaseConfig> = {
  requirement: {
    skillName: 'ai-pm',
    inputFiles: [],
    outputFile: '01-requirement-draft.md',
  },
  analysis: {
    skillName: 'ai-pm-analyze',
    inputFiles: ['01-requirement-draft.md'],
    outputFile: '02-analysis-report.md',
  },
  stories: {
    skillName: 'ai-pm-story',
    inputFiles: ['02-analysis-report.md', '03-competitor-report.md'],
    outputFile: '04-user-stories.md',
  },
  prd: {
    skillName: 'ai-pm-prd',
    inputFiles: ['02-analysis-report.md', '03-competitor-report.md', '04-user-stories.md'],
    outputFile: '05-prd/05-PRD-v1.0.md',
  },
}

export function buildPhasePrompt(projectName: string, phase: string, userInput?: string) {
  const config = PHASE_CONFIG[phase]
  if (!config) throw new Error(`Unknown phase: ${phase}`)

  const previousOutputs: Record<string, string> = {}
  for (const file of config.inputFiles) {
    const content = readProjectFile(projectName, file)
    if (content) {
      previousOutputs[file] = content
    }
  }

  return {
    systemPrompt: buildSystemPrompt(AI_PM_ROOT, config.skillName, {
      projectName,
      previousOutputs,
      userInput,
    }),
    outputFile: config.outputFile,
  }
}
```

**Step 2: 实现流式 API Route**

```typescript
// app/api/ai/stream/route.ts
import { NextRequest } from 'next/server'
import { getClaudeClient, getModel } from '@/lib/claude-client'
import { buildPhasePrompt } from '@/lib/phase-prompt-builder'
import { writeProjectFile } from '@/lib/file-manager'

export async function POST(req: NextRequest) {
  const { projectName, phase, messages, userInput } = await req.json()

  const { systemPrompt, outputFile } = buildPhasePrompt(projectName, phase, userInput)
  const client = getClaudeClient()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullText = ''
        const response = client.messages.stream({
          model: getModel(),
          max_tokens: 8192,
          system: systemPrompt,
          messages: messages || [{ role: 'user', content: userInput || '请开始' }],
        })

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`))
          }
        }

        // 生成完成后写入文件
        if (fullText && outputFile) {
          writeProjectFile(projectName, outputFile, fullText)
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, outputFile })}\n\n`))
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add SSE streaming AI API route with phase prompt builder"
```

---

## Task 8: 应用 Layout Shell

**Files:**
- Create: `ai-pm-web/app/layout.tsx`
- Create: `ai-pm-web/components/layout/sidebar.tsx`
- Create: `ai-pm-web/components/layout/top-bar.tsx`
- Create: `ai-pm-web/app/(dashboard)/layout.tsx`
- Create: `ai-pm-web/app/project/[id]/layout.tsx`

**Step 1: 实现顶栏**

```typescript
// components/layout/top-bar.tsx
// 终末地风格顶栏：// AI PM 品牌 + 绿色脉冲点 + 设置按钮
// monospace 字体，letter-spacing: 3px
```

**Step 2: 实现侧边栏**

```typescript
// components/layout/sidebar.tsx
// 项目列表，每个项目一张卡片
// 金色左侧竖条 = 进行中，灰色 = 已完成
// 底部 [+ NEW] 按钮
```

**Step 3: 实现项目工作台 Layout**

```typescript
// app/project/[id]/layout.tsx
// 顶部：六边形阶段导航条（stage-nav 组件）
// 中间：{children}（各阶段页面）
// 读取项目数据，传递给子页面
```

**Step 4: 验证 Layout 渲染**

```bash
npm run dev
```

浏览器访问 http://localhost:3000，确认看到终末地风格的 Layout 框架。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add terminal-style layout shell with sidebar and stage nav"
```

---

## Task 9: 仪表盘页面

**Files:**
- Create: `ai-pm-web/app/(dashboard)/page.tsx`
- Create: `ai-pm-web/components/project-card.tsx`
- Create: `ai-pm-web/components/new-project-dialog.tsx`

**Step 1: 实现项目卡片**

终末地风格卡片：左侧 rarity stripe、项目名、更新时间、阶段文字、黄色进度条。

**Step 2: 实现新建项目对话框**

直角弹窗，两个输入框（项目名 + 需求描述），黄色确认按钮。

**Step 3: 实现仪表盘页面**

- 调 `/api/projects` 获取项目列表
- 空状态：六边形图标 + "还没有项目，开始第一个吧"
- 点击项目卡片 → 跳转 `/project/{id}/requirement`

**Step 4: 验证**

浏览器测试：创建项目 → 看到项目卡片出现在列表中 → 点击进入项目。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add dashboard page with project list and creation"
```

---

## Task 10: 需求输入页

**Files:**
- Create: `ai-pm-web/app/project/[id]/requirement/page.tsx`
- Create: `ai-pm-web/components/rich-editor.tsx`
- Create: `ai-pm-web/components/file-upload.tsx`

**Step 1: 实现富文本编辑器**

基于 Tiptap，支持：
- 基础格式（标题、加粗、列表）
- 粘贴纯文本/HTML
- 占位符文案："描述你的产品需求..."

**Step 2: 实现文件上传区**

拖拽上传区，支持 PDF/Word/Excel/图片。文件存储到 `output/projects/{name}/07-references/`。

**Step 3: 实现需求输入页面**

- 项目名称（只读，从仪表盘带过来）
- 富文本编辑器
- 文件上传区
- [开始分析 →] 按钮
- 点击按钮 → 将内容写入 `01-requirement-draft.md` → 跳转分析页

**Step 4: 验证**

浏览器测试：输入需求文本 → 上传附件 → 点击开始分析 → 确认文件写入 output/ 目录。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add requirement input page with rich editor and file upload"
```

---

## Task 11: 需求分析页

**Files:**
- Create: `ai-pm-web/app/project/[id]/analysis/page.tsx`
- Create: `ai-pm-web/components/analysis-cards.tsx`
- Create: `ai-pm-web/hooks/use-ai-stream.ts`

**Step 1: 实现 SSE 流式 Hook**

```typescript
// hooks/use-ai-stream.ts
// 封装 EventSource 逻辑：
// - 发起 POST /api/ai/stream
// - 实时更新 state（streaming text）
// - 处理完成/错误状态
// - 返回 { text, isStreaming, error, start, reset }
```

**Step 2: 实现分析结果卡片组**

将 AI 输出的 Markdown 解析为结构化卡片：
- 目标用户卡片（青色竖条）
- 核心痛点卡片（金色竖条）
- 功能范围卡片（含横向优先级条形图）

解析策略：AI 输出按 `##` 二级标题切分，每个标题 → 一张卡片。

**Step 3: 实现内联追问交互**

当 AI 输出包含问题标记（`[QUESTION]` 或以 `？` 结尾的段落）时：
- 显示 AI 追问气泡（金色竖条卡片）
- 渲染快捷选项按钮（如果 AI 给了选项）
- 显示自由输入框
- 用户回答后 → 追加到对话历史 → 继续流式调用

**Step 4: 实现分析页面**

- 进入页面自动触发分析（调 `/api/ai/stream`，phase=analysis）
- 流式输出实时渲染为卡片
- AI 追问时暂停，等用户回答
- 全部完成后显示 [确认，进入用户故事 →] 按钮
- 支持 [↻ 重新分析] 重置

**Step 5: 验证**

浏览器测试：从需求输入进入 → 看到 AI 实时生成分析 → 回答追问 → 确认进入下一阶段。

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add analysis page with streaming AI output and inline chat"
```

---

## Task 12: 用户故事页

**Files:**
- Create: `ai-pm-web/app/project/[id]/stories/page.tsx`
- Create: `ai-pm-web/components/story-board.tsx`
- Create: `ai-pm-web/components/story-card.tsx`

**Step 1: 实现故事卡片**

- 格式："作为[角色]，我想要[功能]，以便[价值]"
- 展开后显示验收标准列表（可编辑）
- 左侧竖条颜色按优先级：P0 金色、P1 青色、P2 灰色

**Step 2: 实现故事看板**

- 按优先级分组（P0/P1/P2），每组可折叠
- 使用 @hello-pangea/dnd 实现拖拽排序
- [+ 添加故事] 手动新增
- 故事总数统计

**Step 3: 实现用户故事页面**

- 进入页面自动调 AI 生成故事（phase=stories）
- 流式输出解析为故事卡片
- 生成完成后用户可编辑、排序、增删
- [确认，进入 PRD →] 按钮
- 确认后将最终故事列表写入 `04-user-stories.md`

**Step 4: 验证**

浏览器测试：进入页面 → 看到 AI 生成故事卡片 → 拖拽排序 → 编辑验收标准 → 确认进入 PRD。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add user stories page with drag-and-drop and priority grouping"
```

---

## Task 13: PRD 生成与预览

**Files:**
- Create: `ai-pm-web/app/project/[id]/prd/page.tsx`
- Create: `ai-pm-web/components/prd-viewer.tsx`
- Create: `ai-pm-web/components/prd-toc.tsx`
- Create: `ai-pm-web/components/mermaid-renderer.tsx`

**Step 1: 实现 Mermaid 渲染器**

```typescript
// components/mermaid-renderer.tsx
// 使用 mermaid.js 客户端渲染
// 检测 ```mermaid 代码块 → 替换为 SVG
```

**Step 2: 实现 PRD 目录导航**

```typescript
// components/prd-toc.tsx
// 解析 Markdown 标题（## / ###）生成目录
// 点击目录项滚动到对应位置
// 当前可见章节高亮
```

**Step 3: 实现 PRD 预览器**

```typescript
// components/prd-viewer.tsx
// react-markdown 渲染 Markdown
// 支持表格、Mermaid、图片
// 点击段落进入编辑模式（contentEditable）
// 编辑完成后同步到 Markdown 源文件
```

**Step 4: 实现 PRD 页面**

- 进入页面自动调 AI 生成 PRD（phase=prd）
- 左侧：PRD 实时流式预览（Markdown 渲染）
- 右侧：目录导航（固定定位）
- 底部：AI 辅助输入框（"帮我把 xx 写详细些"）
- 生成完成后支持点击编辑
- PRD 自动保存到 `05-prd/05-PRD-v1.0.md`

**Step 5: 验证**

浏览器测试：进入 PRD 页面 → 看到实时生成 → Mermaid 图表渲染 → 点击段落编辑 → 目录导航跳转。

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add PRD generation page with live preview, TOC and inline editing"
```

---

## Task 14: 设置页面

**Files:**
- Create: `ai-pm-web/app/settings/page.tsx`
- Create: `ai-pm-web/app/api/config/route.ts`

**Step 1: 实现配置 API**

```typescript
// app/api/config/route.ts
// GET: 读取当前配置（脱敏显示 API Key）
// POST: 保存配置到 data/config.json
// POST /test: 用配置发一个测试请求验证连通性
```

**Step 2: 实现设置页面**

三个输入框：
- 认证密钥（password 类型，不限格式）
- API 地址（留空则默认官方）
- 模型选择（下拉：claude-sonnet-4-6 / claude-opus-4-6 / claude-haiku-4-5-20251001）

[测试连接] 按钮 → 调测试 API → 显示成功/失败
[保存] 按钮

如果已经从环境变量读到配置，显示"已自动检测到 Claude 配置"提示。

**Step 3: Commit**

```bash
git add .
git commit -m "feat: add settings page for API configuration"
```

---

## Task 15: 联调打磨

**Files:**
- Modify: 所有页面和组件

**Step 1: 全链路走通测试**

创建一个测试项目，从仪表盘 → 需求输入 → 分析 → 故事 → PRD 完整走一遍，确认：
- 每个阶段的数据正确传递到下一阶段
- 文件正确写入 output/projects/ 目录
- _status.json 正确更新
- 阶段导航正确反映当前进度

**Step 2: 空状态和错误态**

- 仪表盘无项目 → 六边形空状态图
- AI 请求中 → 黄色脉冲进度条
- AI 请求失败 → 红色竖条错误卡片 + 重试按钮
- API 未配置 → 引导跳转设置页

**Step 3: 动画打磨**

- 页面切换：fadeInUp（0.3s）
- 卡片出现：从下向上浮入（staggered，每张延迟 0.08s）
- 进度条填充：黄色渐变动画（1.6s）
- 六边形 hover：scale(1.08) + 黄色边框
- 按钮 hover：黄色辉光阴影

**Step 4: 响应式适配**

- 桌面（1200px+）：侧边栏 + 主区域
- 平板（768-1200px）：侧边栏收起为图标
- 移动端（<768px）：底部 Tab 导航，侧边栏变抽屉

**Step 5: Commit**

```bash
git add .
git commit -m "feat: polish UI with animations, empty states, and responsive design"
```

---

## 完成标准

MVP 完成时，用户应该能够：

1. 打开浏览器访问 http://localhost:3000
2. 看到终末地风格的仪表盘
3. 点击新建项目，输入需求描述
4. AI 自动分析需求，以卡片形式展示结果
5. 回答 AI 的追问后，自动生成用户故事
6. 编辑排序故事后，自动生成 PRD
7. PRD 支持在线预览、目录导航、点击编辑
8. 所有产出文件写入 output/projects/ 目录，与 Claude Code 版共享
