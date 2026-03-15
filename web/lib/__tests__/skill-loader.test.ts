import { describe, it, expect } from 'vitest'
import { loadSkill, buildSystemPrompt, listSkills } from '../skill-loader'

const AI_PM_ROOT = '<USER_HOME>/workplace/AI_PM'

// ---------------------------------------------------------------------------
// loadSkill
// ---------------------------------------------------------------------------

describe('loadSkill', () => {
  it('loads ai-pm-analyze skill content', () => {
    const content = loadSkill(AI_PM_ROOT, 'ai-pm-analyze')

    expect(content).toBeTruthy()
    expect(content.length).toBeGreaterThan(0)
    // SKILL.md frontmatter should contain the skill name
    expect(content).toContain('ai-pm-analyze')
  })

  it('loads ai-pm skill and includes sub-files when present', () => {
    const content = loadSkill(AI_PM_ROOT, 'ai-pm')

    expect(content).toBeTruthy()
    // ai-pm is the main orchestrator skill – should have substantial content
    expect(content.length).toBeGreaterThan(100)
  })

  it('loads a skill with sub-files and concatenates them', () => {
    // ai-pm-interview has SKILL.md + interview-output.md + interview-phases.md
    const content = loadSkill(AI_PM_ROOT, 'ai-pm-interview')

    expect(content).toBeTruthy()
    // Should include the sub-file marker
    expect(content).toContain('<!-- sub-file:')
    expect(content).toContain('interview-output')
    expect(content).toContain('interview-phases')
  })

  it('throws for a non-existent skill', () => {
    expect(() => loadSkill(AI_PM_ROOT, 'does-not-exist')).toThrow(
      /Skill not found/,
    )
  })

  it('throws for underscore-prefixed directories even if they exist', () => {
    // _core exists on disk but is not a valid skill (no SKILL.md)
    expect(() => loadSkill(AI_PM_ROOT, '_core')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('combines skill content with project context', () => {
    const prompt = buildSystemPrompt(AI_PM_ROOT, 'ai-pm-analyze', {
      projectName: '测试项目',
    })

    // Should contain both skill content and context
    expect(prompt).toContain('ai-pm-analyze')
    expect(prompt).toContain('测试项目')
    expect(prompt).toContain('当前项目上下文')
  })

  it('includes previous outputs when provided', () => {
    const prompt = buildSystemPrompt(AI_PM_ROOT, 'ai-pm-analyze', {
      projectName: '测试项目',
      previousOutputs: {
        '01-需求分析.md': '# 需求分析结果\n核心痛点：...',
      },
    })

    expect(prompt).toContain('已有产出物')
    expect(prompt).toContain('01-需求分析.md')
    expect(prompt).toContain('核心痛点')
  })

  it('includes user input when provided', () => {
    const prompt = buildSystemPrompt(AI_PM_ROOT, 'ai-pm-analyze', {
      projectName: '测试项目',
      userInput: '我想做一个在线教育平台',
    })

    expect(prompt).toContain('用户输入')
    expect(prompt).toContain('我想做一个在线教育平台')
  })
})

// ---------------------------------------------------------------------------
// listSkills
// ---------------------------------------------------------------------------

describe('listSkills', () => {
  it('returns an array of skill names', () => {
    const skills = listSkills(AI_PM_ROOT)

    expect(Array.isArray(skills)).toBe(true)
    expect(skills.length).toBeGreaterThan(0)
  })

  it('includes known skills', () => {
    const skills = listSkills(AI_PM_ROOT)

    expect(skills).toContain('ai-pm')
    expect(skills).toContain('ai-pm-analyze')
    expect(skills).toContain('ai-pm-story')
    expect(skills).toContain('ai-pm-prd')
  })

  it('excludes underscore-prefixed directories', () => {
    const skills = listSkills(AI_PM_ROOT)

    const underscored = skills.filter((s) => s.startsWith('_'))
    expect(underscored).toHaveLength(0)
  })

  it('returns skills in sorted order', () => {
    const skills = listSkills(AI_PM_ROOT)

    const sorted = [...skills].sort()
    expect(skills).toEqual(sorted)
  })
})
