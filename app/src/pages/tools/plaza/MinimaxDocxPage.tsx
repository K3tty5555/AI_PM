import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

type DocxMode = "create" | "edit" | "template"

const MODES: { value: DocxMode; label: string; desc: string }[] = [
  { value: "create",   label: "新建文档",   desc: "从内容描述创建" },
  { value: "edit",     label: "编辑文档",   desc: "修改现有 .docx" },
  { value: "template", label: "套用模板",   desc: "使用模板文件" },
]

export function MinimaxDocxPage() {
  const [mode, setMode] = useState<DocxMode>("create")
  const [content, setContent] = useState("")
  const [filePath, setFilePath] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { text, isStreaming, error, run, reset } = useToolStream("minimax-docx", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    let input = content.trim()
    if (filePath && mode !== "create") input += ` --file "${filePath}"`
    if (mode === "template") input += ` --template`
    run(input)
  }

  function handleClear() {
    reset()
    setContent("")
    setFilePath(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <PlazaSkillPage
      title="Word 文档"
      description="OpenXML 专业 Word 文档生成与格式化"
      source="minimax"
      category="document"
      categoryLabel="文档生成"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      {/* Mode */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)]">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors text-center",
              mode === m.value
                ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={mode === "create" ? "描述要生成的 Word 文档内容..." : "描述修改要求或文档结构..."}
        rows={4}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      {mode !== "create" && (
        <div>
          <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">
            {mode === "edit" ? "上传要编辑的 .docx 文件" : "上传模板 .docx 文件"}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text-primary)] file:cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0]
              setFilePath(f ? (f as File & { path?: string }).path ?? f.name : null)
            }}
          />
        </div>
      )}
    </PlazaSkillPage>
  )
}
