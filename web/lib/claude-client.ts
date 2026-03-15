import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { readClaudeConfig } from './config-reader'

export type { MessageParam }

export interface StreamCallbacks {
  onText: (text: string) => void
  onComplete: (fullText: string) => void
  onError: (error: Error) => void
}

// Use a symbol on globalThis to survive Next.js HMR reloads
const CLIENT_KEY = Symbol.for('__anthropic_client__')
const MODEL_KEY = Symbol.for('__anthropic_model__')

type GlobalStore = typeof globalThis & {
  [CLIENT_KEY]?: Anthropic
  [MODEL_KEY]?: string
}

const store = globalThis as GlobalStore

/**
 * Get (or create) a cached Anthropic client instance.
 * Throws if no configuration is available.
 */
export function getClaudeClient(): Anthropic {
  if (store[CLIENT_KEY]) {
    return store[CLIENT_KEY]
  }

  const config = readClaudeConfig()
  if (!config) {
    throw new Error(
      'API 未配置 — 请前往「设置」页面填写 API Key 后重试。'
    )
  }

  const client = new Anthropic({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  })

  store[CLIENT_KEY] = client
  store[MODEL_KEY] = config.model

  return client
}

/**
 * Clear the cached client instance.
 * Call this after configuration changes so the next `getClaudeClient()` picks up the new values.
 */
export function resetClient(): void {
  delete store[CLIENT_KEY]
  delete store[MODEL_KEY]
}

/**
 * Return the configured model name (e.g. 'claude-sonnet-4-6').
 * Initializes the client if not yet done.
 */
export function getModel(): string {
  if (!store[MODEL_KEY]) {
    getClaudeClient() // side-effect: populates MODEL_KEY
  }
  return store[MODEL_KEY]!
}

/**
 * Stream a chat completion from the Claude API.
 *
 * @param systemPrompt - The system-level instruction
 * @param messages      - The conversation history
 * @param callbacks     - Handlers for text chunks, completion, and errors
 */
export async function streamChat(
  systemPrompt: string,
  messages: MessageParam[],
  callbacks: StreamCallbacks,
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

    stream.on('text', (textDelta) => {
      fullText += textDelta
      callbacks.onText(textDelta)
    })

    // Wait until the stream is fully consumed
    await stream.finalMessage()

    callbacks.onComplete(fullText)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    callbacks.onError(error)
  }
}
