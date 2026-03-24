import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"
import { TemplateUpload } from "@/components/template-upload"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

function parseReplyTemplates(text: string): Array<{name: string; content: string}> {
  const match = text.match(/\[REPLY_TEMPLATES\]([\s\S]*?)\[\/REPLY_TEMPLATES\]/)
  if (!match) return []
  const block = match[1].trim()
  const sections = block.split(/(?=^### )/m).filter(Boolean)
  return sections.map(section => {
    const lines = section.trim().split('\n')
    const name = lines[0].replace(/^### /, '').trim()
    const content = lines.slice(1).join('\n').trim()
    return { name, content }
  }).filter(t => t.name && t.content)
}

export function ToolPriorityPage() {
  const { toast } = useToast()
  const [input, setInput] = useState("")
  const [filePath, setFilePath] = useState<string | null>(null)
  const [templatePath, setTemplatePath] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Array<{name: string; content: string}>>([])
  const { text, isStreaming, isThinking, elapsedSeconds, error, streamMeta, run, reset } = useToolStream("ai-pm-priority")

  useEffect(() => {
    if (!isStreaming && text) {
      setTemplates(parseReplyTemplates(text))
    }
  }, [isStreaming, text])

  const handlePickFile = useCallback(async () => {
    const selected = await dialogOpen({
      multiple: false,
      filters: [
        { name: "表格文件", extensions: ["xlsx", "xls", "csv"] },
        { name: "文本文件", extensions: ["txt", "md"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    })
    if (selected) {
      setFilePath(selected as string)
    }
  }, [])

  const handleRun = useCallback(() => {
    if (!input.trim() && !filePath) return
    reset()
    setTemplates([])
    let userInput = input.trim() || "请分析上传的文件中的需求并评估优先级"
    if (templatePath) {
      userInput += `\n\n---\n\n请严格按照以下模板的格式和结构输出评估结果。模板文件路径：${templatePath}`
    }
    run(userInput, filePath ?? undefined)
  }, [input, filePath, templatePath, run, reset])

  const handleReset = useCallback(() => {
    reset()
    setInput("")
    setFilePath(null)
    setTemplatePath(null)
    setTemplates([])
  }, [reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0
  const displayText = text.replace(/\[REPLY_TEMPLATES\][\s\S]*?\[\/REPLY_TEMPLATES\]/g, '').trimEnd()

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-base font-semibold text-[var(--text-primary)]">需求优先级</h1>
        <span className="text-sm text-[var(--text-secondary)]">需求优先级评估 — 四维评分模型</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* 输入区（仅在未开始时显示） */}
      {!isStreaming && !text && (
        <div className="mt-6">
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            粘贴需求列表，或上传表格文件（Excel/CSV），批量导入需求
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"1. 登录页加载慢（运营提报，影响全量用户）\n2. 数据导出 Excel\n3. 搜索结果排序优化\n..."}
            rows={8}
            className={cn(
              "w-full rounded-lg px-4 py-3 text-sm",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-secondary)]",
              "outline-none resize-none",
              "focus:border-[var(--accent-color)] transition-[border-color]"
            )}
          />
          {filePath && (
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <span className="text-[var(--text-secondary)]">已选文件：</span>
              <span className="text-[var(--text-primary)] font-medium truncate max-w-[400px]">{filePath.split(/[/\\]/).pop()}</span>
              <button onClick={() => setFilePath(null)} className="text-[var(--text-tertiary)] hover:text-[var(--destructive)] transition-colors">×</button>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <TemplateUpload label="评估模板" storageKey="priority" value={templatePath} onSelect={setTemplatePath} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handlePickFile}>
              上传表格文件
            </Button>
            <Button variant="primary" onClick={handleRun} disabled={!input.trim() && !filePath}>
              开始评估
            </Button>
          </div>
        </div>
      )}

      {/* 进度 */}
      {isStreaming && (
        <div className="mt-6">
          <ProgressBar value={progressValue} animated />
          {isThinking && (
            <p className="mt-2 text-[13px] text-[var(--text-secondary)] animate-[thinkingPulse_1.5s_ease-in-out_infinite]">思考中...</p>
          )}
          <p className="mt-2 text-[12px] tabular-nums text-[var(--text-tertiary)]">
            {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="mt-4 rounded-lg border-l-[3px] border-l-[var(--destructive)] bg-[color-mix(in_srgb,var(--destructive)_5%,transparent)] px-4 py-3">
          <p className="text-sm text-[var(--destructive)]">{error}</p>
          <Button variant="ghost" size="sm" onClick={handleReset} className="mt-2">重置</Button>
        </div>
      )}

      {/* 结果 */}
      {text && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-secondary)]">
              结果
            </span>
            {!isStreaming && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleReset}>重新评估</Button>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(displayText).then(() => toast("已复制", "success"))}>复制结果</Button>
              </div>
            )}
          </div>
          <PrdViewer markdown={displayText} isStreaming={isStreaming} />
          {!isStreaming && streamMeta && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              {streamMeta.inputTokens != null
                ? `耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens · 输出 ${streamMeta.outputTokens?.toLocaleString()} tokens`
                : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`}
            </p>
          )}
          {!isStreaming && templates.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">回复模板</h3>
              <div className="space-y-3">
                {templates.map((t, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">{t.name}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(t.content)}
                        className="text-[12px] text-[var(--accent-color)] hover:opacity-70 transition-opacity"
                      >
                        复制
                      </button>
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">{t.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
