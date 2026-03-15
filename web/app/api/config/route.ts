import { NextResponse } from "next/server"
import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import { readClaudeConfig, saveLocalConfig } from "@/lib/config-reader"
import { resetClient } from "@/lib/claude-client"

/**
 * Mask an API key for display: show first 4 and last 4 chars, mask the middle.
 * e.g. "sk-ant-abc123...xyz789" -> "sk-a****z789"
 */
function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return key.slice(0, 2) + "****" + key.slice(-2)
  }
  return key.slice(0, 4) + "****" + key.slice(-4)
}

type ConfigSource = "env" | "shell" | "local" | "none"

/**
 * Detect where the API key configuration is coming from.
 */
function detectConfigSource(): ConfigSource {
  // Tier 1: process env
  if (process.env.ANTHROPIC_API_KEY) {
    return "env"
  }

  // Tier 2: shell profile — try spawning a login shell
  try {
    const shellKey = execSync('bash -ilc "echo \\$ANTHROPIC_API_KEY"', {
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
    if (shellKey) {
      return "shell"
    }
  } catch {
    // ignore
  }

  // Tier 3: local config file
  try {
    const configPath = path.join(process.cwd(), "data", "config.json")
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"))
      if (raw.apiKey) {
        return "local"
      }
    }
  } catch {
    // ignore
  }

  return "none"
}

// GET /api/config — Read current configuration (API key is masked)
export async function GET() {
  try {
    const config = readClaudeConfig()
    const configSource = detectConfigSource()

    if (!config) {
      return NextResponse.json({
        hasConfig: false,
        configSource: "none" as ConfigSource,
        apiKey: null,
        baseUrl: null,
        model: "claude-sonnet-4-6",
      })
    }

    return NextResponse.json({
      hasConfig: true,
      configSource,
      apiKey: maskApiKey(config.apiKey),
      baseUrl: config.baseUrl || null,
      model: config.model,
    })
  } catch (error) {
    console.error("Failed to read config:", error)
    return NextResponse.json(
      { error: "读取配置失败" },
      { status: 500 }
    )
  }
}

// POST /api/config — Save configuration to local config file
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { apiKey, baseUrl, model } = body

    const updates: Record<string, string> = {}
    if (apiKey && typeof apiKey === "string") updates.apiKey = apiKey
    if (baseUrl !== undefined) updates.baseUrl = baseUrl || ""
    if (model && typeof model === "string") updates.model = model

    saveLocalConfig(updates)
    resetClient()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to save config:", error)
    return NextResponse.json(
      { error: "保存配置失败" },
      { status: 500 }
    )
  }
}
