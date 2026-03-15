import { z } from 'zod'
import { getProject } from '@/lib/project-service'
import { buildPhasePrompt } from '@/lib/phase-prompt-builder'
import { getClaudeClient, getModel } from '@/lib/claude-client'
import { writeProjectFile } from '@/lib/file-manager'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const RequestSchema = z.object({
  projectId: z.string().min(1, 'projectId 不能为空'),
  phase: z.string().min(1, 'phase 不能为空'),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
})

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEncode(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// ---------------------------------------------------------------------------
// POST /api/ai/stream
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // 1. Parse & validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(
      JSON.stringify({ error: '请求体不是合法 JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: '参数校验失败',
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { projectId, phase, messages } = parsed.data

  // 2. Look up project
  const project = getProject(projectId)
  if (!project) {
    return new Response(
      JSON.stringify({ error: '项目不存在' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // 3. Build system prompt for this phase
  // The last user message serves as userInput context
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  let phasePromptResult: ReturnType<typeof buildPhasePrompt>
  try {
    phasePromptResult = buildPhasePrompt(
      project.name,
      phase,
      lastUserMsg?.content,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { systemPrompt, outputFile } = phasePromptResult

  // 4. Create SSE stream
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = ''

      try {
        const client = getClaudeClient()

        const anthropicStream = client.messages.stream({
          model: getModel(),
          max_tokens: 8192,
          system: systemPrompt,
          messages: messages as MessageParam[],
        })

        anthropicStream.on('text', (textDelta) => {
          fullText += textDelta
          controller.enqueue(
            encoder.encode(sseEncode({ text: textDelta }))
          )
        })

        // Wait for the stream to finish
        await anthropicStream.finalMessage()

        // Write complete output to file
        try {
          writeProjectFile(project.name, outputFile, fullText)
        } catch (writeErr) {
          console.error('Failed to write output file:', writeErr)
        }

        // Send done event
        controller.enqueue(
          encoder.encode(sseEncode({ done: true, outputFile }))
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Stream error:', err)
        controller.enqueue(
          encoder.encode(sseEncode({ error: message }))
        )
      } finally {
        controller.close()
      }
    },
  })

  // 5. Return SSE response
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
