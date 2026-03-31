import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

type XlsxMode = "create" | "analyze"

export function MinimaxXlsxPage() {
  const [mode, setMode] = useState<XlsxMode>("create")
  const [description, setDescription] = useState("")
  const [filePath, setFilePath] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { text, isStreaming, error, run, reset } = useToolStream("minimax-xlsx", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (mode === "create") {
      if (!description.trim()) return
      run(description.trim())
    } else {
      if (!filePath) return
      let input = `--file "${filePath}"`
      if (description.trim()) input += ` ${description.trim()}`
      run(input)
    }
  }

  function handleClear() {
    reset()
    setDescription("")
    setFilePath(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <PlazaSkillPage
      title="Excel 表格"
      description="Excel 文件创建、分析、编辑（零格式损失）"
      source="minimax"
      category="document"
      categoryLabel="文档生成"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] w-fit">
        {(["create", "analyze"] as XlsxMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-colors",
              mode === m
                ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {m === "create" ? "从描述新建" : "分析现有文件"}
          </button>
        ))}
      </div>

      {mode === "create" ? (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述要创建的表格，例如：月度销售报告，包含日期、产品名称、销量、金额列..."
          rows={4}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
        />
      ) : (
        <>
          <div>
            <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">上传 Excel 文件</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text-primary)] file:cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0]
                setFilePath(f ? (f as File & { path?: string }).path ?? f.name : null)
              }}
            />
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="（可选）描述分析要求，例如：汇总各月销售额，找出增长最快的产品..."
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
          />
        </>
      )}
    </PlazaSkillPage>
  )
}
