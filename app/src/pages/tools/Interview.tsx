import { useState, useCallback } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { InlineChat } from "@/components/inline-chat"
import { ProjectSelector } from "@/components/project-selector"
import { useToolStream } from "@/hooks/use-tool-stream"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

interface Message { role: string; content: string }

function detectQuestion(text: string): { hasQuestion: boolean; question: string } {
  const paragraphs = text.split(/\n\n+/)
  const lastParagraphs = paragraphs.slice(-3)
  for (let i = lastParagraphs.length - 1; i >= 0; i--) {
    const p = lastParagraphs[i].trim()
    if (p.endsWith("？") || p.endsWith("?")) {
      return { hasQuestion: true, question: p }
    }
  }
  return { hasQuestion: false, question: "" }
}

export function ToolInterviewPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<"setup" | "interview" | "done">("setup")
  const [context, setContext] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [chatHistory, setChatHistory] = useState<Array<{ q: string; a: string }>>([])
  const [saving, setSaving] = useState(false)
  const [searchParams] = useSearchParams()
  const initialProjectId = searchParams.get("projectId") ?? localStorage.getItem("tool-binding:interview") ?? null
  const [boundProjectId, setBoundProjectId] = useState<string | null>(initialProjectId)
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } =
    useToolStream("ai-pm-interview", boundProjectId ?? undefined)

  const handleStart = useCallback(() => {
    if (!context.trim()) return
    reset()
    const initial: Message = { role: "user", content: context.trim() }
    setMessages([initial])
    setPhase("interview")
    run(context.trim())
  }, [context, run, reset])

  const questionInfo = !isStreaming && text
    ? detectQuestion(text)
    : { hasQuestion: false, question: "" }

  const handleAnswer = useCallback((answer: string) => {
    setChatHistory((prev) => [...prev, { q: questionInfo.question, a: answer }])
    const newMessages: Message[] = [
      ...messages,
      { role: "assistant", content: text },
      { role: "user", content: answer },
    ]
    setMessages(newMessages)
    reset()
    const fullInput = newMessages.map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.content}`).join("\n\n")
    run(fullInput)
  }, [messages, text, questionInfo.question, run, reset])

  const handleGenerateReport = useCallback(() => {
    const fullInput = [
      ...messages.map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.content}`),
      "AI：" + text,
      "用户：请基于以上完整访谈内容，生成一份结构化访谈报告，包括访谈背景、关键发现、用户痛点、产品建议。",
    ].join("\n\n")
    reset()
    setPhase("done")
    run(fullInput)
  }, [messages, text, run, reset])

  const handleSaveToPrd = useCallback(async () => {
    if (!text || !boundProjectId) return
    setSaving(true)
    try {
      await api.saveProjectFile({
        projectId: boundProjectId,
        fileName: "01-requirement-draft.md",
        content: text,
      })
      navigate(`/project/${boundProjectId}/prd?autostart=1`)
    } catch (err) {
      console.error("Failed to save requirement:", err)
      setSaving(false)
    }
  }, [text, boundProjectId, navigate])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">调研访谈</h1>
        <span className="text-sm text-[var(--text-secondary)]">现场调研 / 客户访谈</span>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <ProjectSelector
        toolKey="interview"
        value={boundProjectId}
        onChange={setBoundProjectId}
        className="mt-4"
      />

      {/* 初始设置 */}
      {phase === "setup" && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">描述本次调研目标或访谈背景</p>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={"例：调研目标用户对现有 NPS 弹窗的体验感受，了解触发时机是否合适、问题是否清晰。受访者：电商平台运营人员。"}
            rows={5}
            className={cn(
              "w-full rounded-lg px-4 py-3 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-secondary)]",
              "outline-none resize-none",
              "focus:border-[var(--accent-color)] transition-[border-color]"
            )}
          />
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={handleStart} disabled={!context.trim()}>开始访谈</Button>
          </div>
        </div>
      )}

      {/* 访谈进行中 */}
      {phase !== "setup" && (
        <div className="mt-6">
          {isStreaming && (
            <div className="mb-4">
              <ProgressBar value={progressValue} animated />
              {isThinking && <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">思考中...</p>}
              <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
                {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[var(--destructive)]/5 px-4 py-3">
              <p className="text-sm text-[var(--destructive)]">{error}</p>
            </div>
          )}

          {/* AI 回答 */}
          <PrdViewer markdown={text} isStreaming={isStreaming} />

          {/* 历史问答 */}
          {chatHistory.length > 0 && (
            <div className="mt-4 space-y-2">
              {chatHistory.map((round, i) => (
                <InlineChat
                  key={i}
                  question={round.q}
                  isCollapsed
                  collapsedSummary={`已回答：${round.a}`}
                />
              ))}
            </div>
          )}

          {/* 当前问题 */}
          {!isStreaming && text && questionInfo.hasQuestion && phase === "interview" && (
            <div className="mt-6">
              <InlineChat question={questionInfo.question} onAnswer={handleAnswer} />
            </div>
          )}

          {/* 访谈完成，生成报告 */}
          {!isStreaming && text && !questionInfo.hasQuestion && phase === "interview" && (
            <div className="mt-6 flex justify-end">
              <Button variant="primary" onClick={handleGenerateReport}>生成访谈报告</Button>
            </div>
          )}

          {/* 报告完成后显示元信息 */}
          {!isStreaming && phase === "done" && streamMeta && (
            <p className="mt-4 text-xs text-[var(--text-tertiary)]">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}

          {/* Save to project requirement */}
          {!isStreaming && phase === "done" && text && (
            <div className="mt-6 p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]">
              <p className="text-[13px] text-[var(--text-secondary)] mb-3">
                将访谈报告保存为项目需求，直接进入 PRD 生成
              </p>
              {boundProjectId ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveToPrd}
                  disabled={saving}
                >
                  {saving ? "保存中..." : "保存为项目需求 + 生成 PRD"}
                </Button>
              ) : (
                <p className="text-[12px] text-[var(--text-tertiary)]">
                  请先在上方选择或绑定一个项目
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
