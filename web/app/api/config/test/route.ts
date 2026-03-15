import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { readClaudeConfig } from "@/lib/config-reader"

// POST /api/config/test — Test the Claude API connection
export async function POST(request: Request) {
  try {
    let apiKey: string | undefined
    let baseUrl: string | undefined
    let model: string | undefined

    // Allow body to override current config for testing before save
    try {
      const body = await request.json()
      apiKey = body.apiKey || undefined
      baseUrl = body.baseUrl || undefined
      model = body.model || undefined
    } catch {
      // empty body is fine — use current config
    }

    // Fall back to current config for any missing fields
    const currentConfig = readClaudeConfig()

    const finalApiKey = apiKey || currentConfig?.apiKey
    const finalBaseUrl = baseUrl || currentConfig?.baseUrl
    const finalModel = model || currentConfig?.model || "claude-sonnet-4-6"

    if (!finalApiKey) {
      return NextResponse.json({
        ok: false,
        error: "未找到 API Key，请先配置认证密钥",
      })
    }

    // Create a temporary client for testing
    const client = new Anthropic({
      apiKey: finalApiKey,
      ...(finalBaseUrl ? { baseURL: finalBaseUrl } : {}),
    })

    const response = await client.messages.create({
      model: finalModel,
      max_tokens: 10,
      messages: [{ role: "user", content: "Hello" }],
    })

    return NextResponse.json({
      ok: true,
      model: response.model,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "未知错误"
    console.error("Config test failed:", message)

    return NextResponse.json({
      ok: false,
      error: message,
    })
  }
}
