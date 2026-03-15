import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptContext {
  projectName: string
  previousOutputs?: Record<string, string> // filename → content
  userInput?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKILL_ENTRY = 'SKILL.md'
const SKILLS_DIR = '.claude/skills'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function skillsRoot(aiPmRoot: string): string {
  return path.join(aiPmRoot, SKILLS_DIR)
}

function skillDir(aiPmRoot: string, skillName: string): string {
  return path.join(skillsRoot(aiPmRoot), skillName)
}

/**
 * Collect all .md files in a skill directory.
 * SKILL.md is always first; remaining files are sorted alphabetically.
 */
function collectMarkdownFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))

  const entryFile = entries.find((f) => f === SKILL_ENTRY)
  const rest = entries.filter((f) => f !== SKILL_ENTRY).sort()

  const ordered: string[] = []
  if (entryFile) ordered.push(entryFile)
  ordered.push(...rest)

  return ordered.map((f) => path.join(dir, f))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a single skill's content by reading SKILL.md (and any sibling .md
 * files) from `<aiPmRoot>/.claude/skills/<skillName>/`.
 *
 * Throws if the skill directory or SKILL.md does not exist.
 */
export function loadSkill(aiPmRoot: string, skillName: string): string {
  const dir = skillDir(aiPmRoot, skillName)

  if (!fs.existsSync(dir)) {
    throw new Error(`Skill not found: ${skillName} (looked in ${dir})`)
  }

  const entryPath = path.join(dir, SKILL_ENTRY)
  if (!fs.existsSync(entryPath)) {
    throw new Error(
      `Skill entry file missing: ${entryPath}`,
    )
  }

  const files = collectMarkdownFiles(dir)
  const sections = files.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8')
    // For sub-files (not SKILL.md), wrap with a heading so the LLM can
    // distinguish sections.
    if (path.basename(filePath) === SKILL_ENTRY) {
      return content
    }
    const label = path.basename(filePath, '.md')
    return `\n<!-- sub-file: ${label} -->\n${content}`
  })

  return sections.join('\n')
}

/**
 * Build a complete system prompt by combining the skill content with
 * runtime project context.
 */
export function buildSystemPrompt(
  aiPmRoot: string,
  skillName: string,
  context: PromptContext,
): string {
  const skillContent = loadSkill(aiPmRoot, skillName)

  const parts: string[] = [skillContent]

  // -- Project context block ------------------------------------------------
  const ctxLines: string[] = [
    '',
    '---',
    '',
    '## 当前项目上下文',
    '',
    `- 项目名称：${context.projectName}`,
  ]

  if (context.previousOutputs && Object.keys(context.previousOutputs).length > 0) {
    ctxLines.push('')
    ctxLines.push('### 已有产出物')
    ctxLines.push('')
    for (const [filename, content] of Object.entries(context.previousOutputs)) {
      ctxLines.push(`#### ${filename}`)
      ctxLines.push('')
      ctxLines.push('```')
      ctxLines.push(content)
      ctxLines.push('```')
      ctxLines.push('')
    }
  }

  if (context.userInput) {
    ctxLines.push('')
    ctxLines.push('### 用户输入')
    ctxLines.push('')
    ctxLines.push(context.userInput)
  }

  parts.push(ctxLines.join('\n'))

  return parts.join('\n')
}

/**
 * List all available skill names under `<aiPmRoot>/.claude/skills/`.
 *
 * Directories starting with `_` (e.g. `_core`, `_prompts`) are excluded.
 * Only directories that contain a SKILL.md are returned.
 */
export function listSkills(aiPmRoot: string): string[] {
  const root = skillsRoot(aiPmRoot)

  if (!fs.existsSync(root)) {
    throw new Error(`Skills directory not found: ${root}`)
  }

  const entries = fs.readdirSync(root, { withFileTypes: true })

  return entries
    .filter((entry) => {
      if (!entry.isDirectory()) return false
      if (entry.name.startsWith('_')) return false
      // Must contain SKILL.md to count as a valid skill
      const entryPath = path.join(root, entry.name, SKILL_ENTRY)
      return fs.existsSync(entryPath)
    })
    .map((entry) => entry.name)
    .sort()
}
