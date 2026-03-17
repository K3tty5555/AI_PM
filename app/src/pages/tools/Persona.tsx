import { useState, useCallback } from "react"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { useToolStream } from "@/hooks/use-tool-stream"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

export function ToolPersonaPage() {
  const [tab, setTab] = useState<"analyze" | "list">("analyze")
  const [filePath, setFilePath] = useState("")
  const [fileContent, setFileContent] = useState("")
  const { text, isStreaming, isThinking, elapsedSeconds, error, run, reset } = useToolStream("ai-pm-persona")

  const handleSelectFile = useCallback(async () => {
    const selected = await openDialog({ filters: [{ name: "Markdown", extensions: ["md"] }] })
    if (selected && typeof selected === "string") {
      setFilePath(selected)
      try {
        const content = await api.readFile(selected)
        setFileContent(content)
      } catch (err) {
        console.error(err)
      }
    }
  }, [])

  const handleAnalyze = useCallback(() => {
    if (!fileContent) return
    reset()
    run(`请分析以下 PRD 文档的写作风格，生成风格档案：\n\n${fileContent}`)
  }, [fileContent, run, reset])

  const progressValue = isStreaming ? Math.min(90, Math.floor(text.length / 20)) : text ? 100 : 0

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <div className="mb-6 flex items-center gap-3">
        <Badge variant="outline">PERSONA</Badge>
        <span className="text-sm text-[var(--text-muted)]">产品分身 — 学习你的写作风格</span>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* Tab 切换 */}
      <div className="mt-4 flex gap-0">
        {(["analyze", "list"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-xs font-[var(--font-geist-mono),_'Courier_New',_monospace] uppercase tracking-[1px] transition-colors",
              tab === t
                ? "border-b-2 border-[var(--yellow)] text-[var(--dark)]"
                : "text-[var(--text-muted)] hover:text-[var(--dark)]"
            )}
          >
            {t === "analyze" ? "分析文档" : "已保存风格"}
          </button>
        ))}
      </div>

      {tab === "analyze" && (
        <div className="mt-6">
          {!isStreaming && !text && (
            <>
              <p className="mb-3 text-sm text-[var(--text-muted)]">
                上传你写的 PRD 文件，AI 将分析你的写作风格、措辞习惯和结构偏好
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={filePath}
                  readOnly
                  placeholder="选择 .md 文件..."
                  className={cn(
                    "flex-1 h-9 px-3 text-sm",
                    "bg-transparent border border-[var(--border)]",
                    "placeholder:text-[var(--text-muted)]",
                    "outline-none"
                  )}
                />
                <Button variant="ghost" size="sm" onClick={handleSelectFile}>选择文件</Button>
              </div>
              {fileContent && (
                <div className="mt-3 flex justify-end">
                  <Button variant="primary" onClick={handleAnalyze}>开始分析</Button>
                </div>
              )}
            </>
          )}

          {isStreaming && (
            <div className="mt-6">
              <ProgressBar value={progressValue} animated />
              {isThinking && <p className="mt-2 text-sm text-[var(--text-muted)] animate-pulse">正在思考...</p>}
              <p className="mt-2 font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs text-[var(--text-muted)]">
                {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-4">
              <p className="text-sm text-[var(--destructive)]">{error}</p>
              <Button variant="ghost" size="sm" onClick={() => { reset(); setFileContent(""); setFilePath("") }} className="mt-2">重置</Button>
            </div>
          )}

          {text && (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs uppercase tracking-[2px] text-[var(--text-muted)]">风格分析结果</span>
                {!isStreaming && (
                  <Button variant="ghost" size="sm" onClick={() => { reset(); setFileContent(""); setFilePath("") }}>重新分析</Button>
                )}
              </div>
              <PrdViewer markdown={text} isStreaming={isStreaming} />
            </div>
          )}
        </div>
      )}

      {tab === "list" && (
        <div className="mt-6">
          <p className="text-sm text-[var(--text-muted)]">
            已保存的风格档案将在这里显示。分析 PRD 文档后可保存为风格档案。
          </p>
          {/* TODO: 列出 {projectsDir}/templates/prd-styles/ 下各目录 */}
          <p className="mt-4 text-xs text-[var(--text-muted)]">（功能完善中）</p>
        </div>
      )}
    </div>
  )
}
