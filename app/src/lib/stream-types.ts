export interface StreamChunkPayload {
  streamKey: string
  text: string
}

export interface StreamErrorPayload {
  streamKey: string
  message: string
}

export interface StreamDonePayload {
  streamKey: string
  outputFile: string
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  finalText?: string
}

export interface StreamToolPayload {
  streamKey: string
  tool: string
  status: "running" | "idle"
}

export interface StreamMeta {
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
}
