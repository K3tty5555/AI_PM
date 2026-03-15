import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// We need to test config-reader in isolation, controlling env vars and file system.
// Import after setting up mocks.

describe('config-reader', () => {
  const originalEnv = { ...process.env }
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-reader-test-'))
    // Clear relevant env vars to start clean
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_BASE_URL
    delete process.env.ANTHROPIC_MODEL
  })

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv }
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true })
    // Reset module cache so each test gets a fresh import
    vi.resetModules()
  })

  // ---------------------------------------------------------------------------
  // readClaudeConfig – environment variables
  // ---------------------------------------------------------------------------

  describe('readClaudeConfig', () => {
    it('reads config from environment variables', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-env-key'
      process.env.ANTHROPIC_BASE_URL = 'https://custom.api.example.com'
      process.env.ANTHROPIC_MODEL = 'claude-opus-4-20250514'

      const { readClaudeConfig } = await import('../config-reader')
      const config = readClaudeConfig()

      expect(config).not.toBeNull()
      expect(config!.apiKey).toBe('sk-test-env-key')
      expect(config!.baseUrl).toBe('https://custom.api.example.com')
      expect(config!.model).toBe('claude-opus-4-20250514')
    })

    it('uses default model when ANTHROPIC_MODEL is not set', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-key'

      const { readClaudeConfig } = await import('../config-reader')
      const config = readClaudeConfig()

      expect(config).not.toBeNull()
      expect(config!.model).toBe('claude-sonnet-4-6')
    })

    it('returns null when no API key is available anywhere', async () => {
      // No env vars, no shell profile match, no local config
      // Mock cwd to tmpDir so local config won't be found
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

      const { readClaudeConfig } = await import('../config-reader')
      const config = readClaudeConfig()

      expect(config).toBeNull()
      cwdSpy.mockRestore()
    })

    it('does not throw when environment variables are empty', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

      const { readClaudeConfig } = await import('../config-reader')

      expect(() => readClaudeConfig()).not.toThrow()
      cwdSpy.mockRestore()
    })

    it('omits baseUrl from result when not configured', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-key'

      const { readClaudeConfig } = await import('../config-reader')
      const config = readClaudeConfig()

      expect(config).not.toBeNull()
      expect(config!).not.toHaveProperty('baseUrl')
    })
  })

  // ---------------------------------------------------------------------------
  // saveLocalConfig & readClaudeConfig integration
  // ---------------------------------------------------------------------------

  describe('saveLocalConfig', () => {
    it('writes config to data/config.json and reads it back', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

      const { saveLocalConfig, readClaudeConfig } = await import('../config-reader')

      saveLocalConfig({
        apiKey: 'sk-local-test',
        baseUrl: 'https://local.example.com',
        model: 'claude-haiku-3-20250307',
      })

      // Verify the file was written
      const configPath = path.join(tmpDir, 'data', 'config.json')
      expect(fs.existsSync(configPath)).toBe(true)

      // Verify content
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      expect(raw.apiKey).toBe('sk-local-test')
      expect(raw.baseUrl).toBe('https://local.example.com')
      expect(raw.model).toBe('claude-haiku-3-20250307')

      // readClaudeConfig should now pick up the local config
      const config = readClaudeConfig()
      expect(config).not.toBeNull()
      expect(config!.apiKey).toBe('sk-local-test')

      cwdSpy.mockRestore()
    })

    it('merges with existing config without overwriting unset fields', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

      const { saveLocalConfig } = await import('../config-reader')

      // First write
      saveLocalConfig({
        apiKey: 'sk-original',
        model: 'claude-sonnet-4-6',
      })

      // Second write — only update baseUrl
      saveLocalConfig({
        baseUrl: 'https://new-base.example.com',
      })

      const configPath = path.join(tmpDir, 'data', 'config.json')
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

      // Original fields preserved
      expect(raw.apiKey).toBe('sk-original')
      expect(raw.model).toBe('claude-sonnet-4-6')
      // New field added
      expect(raw.baseUrl).toBe('https://new-base.example.com')

      cwdSpy.mockRestore()
    })

    it('creates data/ directory if it does not exist', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

      const { saveLocalConfig } = await import('../config-reader')

      const dataDir = path.join(tmpDir, 'data')
      expect(fs.existsSync(dataDir)).toBe(false)

      saveLocalConfig({ apiKey: 'sk-test' })

      expect(fs.existsSync(dataDir)).toBe(true)

      cwdSpy.mockRestore()
    })
  })

  // ---------------------------------------------------------------------------
  // Priority: env > shell > local
  // ---------------------------------------------------------------------------

  describe('priority', () => {
    it('environment variables take precedence over local config', async () => {
      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

      const { saveLocalConfig, readClaudeConfig } = await import('../config-reader')

      // Write a local config first
      saveLocalConfig({ apiKey: 'sk-local', model: 'local-model' })

      // Then set env var — should win
      process.env.ANTHROPIC_API_KEY = 'sk-env-wins'
      process.env.ANTHROPIC_MODEL = 'env-model'

      // Need fresh import to avoid caching
      vi.resetModules()
      const { readClaudeConfig: freshRead } = await import('../config-reader')
      const config = freshRead()

      expect(config!.apiKey).toBe('sk-env-wins')
      expect(config!.model).toBe('env-model')

      cwdSpy.mockRestore()
    })
  })
})
