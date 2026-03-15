import { buildSystemPrompt, type PromptContext } from './skill-loader'
import { readProjectFile } from './file-manager'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhaseConfig {
  skillName: string
  inputFiles: string[] // 需要读取的前置产出物
  outputFile: string // 本阶段的输出文件名
}

export interface PhasePromptResult {
  systemPrompt: string
  outputFile: string
}

// ---------------------------------------------------------------------------
// Phase → Config 映射
// ---------------------------------------------------------------------------

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
  research: {
    skillName: 'ai-pm-research',
    inputFiles: ['01-requirement-draft.md', '02-analysis-report.md'],
    outputFile: '03-competitor-report.md',
  },
  stories: {
    skillName: 'ai-pm-story',
    inputFiles: ['02-analysis-report.md', '03-competitor-report.md'],
    outputFile: '04-user-stories.md',
  },
  prd: {
    skillName: 'ai-pm-prd',
    inputFiles: [
      '02-analysis-report.md',
      '03-competitor-report.md',
      '04-user-stories.md',
    ],
    outputFile: '05-prd/05-PRD-v1.0.md',
  },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 获取阶段配置，不存在则抛错
 */
export function getPhaseConfig(phase: string): PhaseConfig {
  const config = PHASE_CONFIG[phase]
  if (!config) {
    throw new Error(
      `未知阶段: ${phase}，可用阶段: ${Object.keys(PHASE_CONFIG).join(', ')}`
    )
  }
  return config
}

/**
 * 根据阶段构建完整的 system prompt。
 *
 * 1. 从 PHASE_CONFIG 查配置
 * 2. 读取 inputFiles 中的已有产出物（不存在的跳过）
 * 3. 调 buildSystemPrompt 拼接
 * 4. 返回 systemPrompt 和 outputFile
 */
export function buildPhasePrompt(
  projectName: string,
  phase: string,
  userInput?: string,
): PhasePromptResult {
  const config = getPhaseConfig(phase)

  const aiPmRoot = process.env.AI_PM_ROOT
  if (!aiPmRoot) {
    throw new Error('环境变量 AI_PM_ROOT 未设置')
  }

  // 读取前置产出物
  const previousOutputs: Record<string, string> = {}
  for (const fileName of config.inputFiles) {
    const content = readProjectFile(projectName, fileName)
    if (content !== null) {
      previousOutputs[fileName] = content
    }
  }

  const context: PromptContext = {
    projectName,
    previousOutputs:
      Object.keys(previousOutputs).length > 0 ? previousOutputs : undefined,
    userInput,
  }

  const systemPrompt = buildSystemPrompt(aiPmRoot, config.skillName, context)

  return {
    systemPrompt,
    outputFile: config.outputFile,
  }
}
