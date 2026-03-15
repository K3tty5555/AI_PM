import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export interface ClaudeConfig {
  apiKey: string
  baseUrl?: string
  model: string
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'

/**
 * Resolve the project root directory (where package.json lives).
 */
function getProjectRoot(): string {
  return path.resolve(process.cwd())
}

/**
 * Path to the local config file: {projectRoot}/data/config.json
 */
function getLocalConfigPath(): string {
  return path.join(getProjectRoot(), 'data', 'config.json')
}

/**
 * Try to read a shell environment variable by spawning an interactive login shell.
 * This picks up variables exported in ~/.zshrc, ~/.bashrc, etc.
 * Returns empty string on any failure.
 */
function readFromShellProfile(varName: string): string {
  try {
    return execSync(`bash -ilc "echo \\$${varName}"`, {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return ''
  }
}

/**
 * Read local config from data/config.json.
 * Returns partial config (may be empty object if file doesn't exist or is invalid).
 */
function readLocalConfig(): Partial<ClaudeConfig> {
  try {
    const raw = fs.readFileSync(getLocalConfigPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Partial<ClaudeConfig>
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Auto-detect Claude configuration using a three-tier fallback strategy:
 *
 * 1. **Environment variables** (highest priority):
 *    ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, ANTHROPIC_MODEL
 *
 * 2. **Shell profile** (~/.zshrc / ~/.bashrc exports):
 *    Spawns an interactive login shell to resolve variables not yet in the
 *    current process environment.
 *
 * 3. **Local config file** (lowest priority):
 *    Reads from `{projectRoot}/data/config.json`.
 *
 * Returns `null` if no API key can be found through any method.
 */
export function readClaudeConfig(): ClaudeConfig | null {
  // --- Tier 1: process environment variables ---
  let apiKey = process.env.ANTHROPIC_API_KEY || ''
  let baseUrl = process.env.ANTHROPIC_BASE_URL || ''
  let model = process.env.ANTHROPIC_MODEL || ''

  // --- Tier 2: shell profile ---
  if (!apiKey) {
    apiKey = readFromShellProfile('ANTHROPIC_API_KEY')
  }
  if (!baseUrl) {
    baseUrl = readFromShellProfile('ANTHROPIC_BASE_URL')
  }
  if (!model) {
    model = readFromShellProfile('ANTHROPIC_MODEL')
  }

  // --- Tier 3: local config file ---
  const localConfig = readLocalConfig()
  if (!apiKey && localConfig.apiKey) {
    apiKey = localConfig.apiKey
  }
  if (!baseUrl && localConfig.baseUrl) {
    baseUrl = localConfig.baseUrl
  }
  if (!model && localConfig.model) {
    model = localConfig.model
  }

  // No API key found at all — cannot proceed
  if (!apiKey) {
    return null
  }

  return {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    model: model || DEFAULT_MODEL,
  }
}

/**
 * Save (merge) configuration to the local config file at `data/config.json`.
 * Only the provided fields are updated; existing fields are preserved.
 */
export function saveLocalConfig(config: Partial<ClaudeConfig>): void {
  const configPath = getLocalConfigPath()
  const dir = path.dirname(configPath)

  // Ensure the data/ directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Read existing config, merge, and write back
  const existing = readLocalConfig()
  const merged = { ...existing, ...config }

  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
}
