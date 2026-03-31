import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

const MODES = [
  { value: "describe", label: "图像描述" },
  { value: "ocr",      label: "OCR 识别" },
  { value: "ui",       label: "UI 审查" },
  { value: "chart",    label: "图表提取" },
]

export function VisionAnalysisPage() {
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [mode, setMode] = useState(MODES[0].value)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { text, isStreaming, error, run, reset } = useToolStream("vision-analysis", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!imagePath) return
    run(`--mode ${mode} --image "${imagePath}"`)
  }

  function handleClear() {
    reset()
    setImagePath(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <PlazaSkillPage
      title="图像分析"
      description="MiniMax VL 图像描述 / OCR / UI 审查 / 图表提取"
      source="minimax"
      category="content"
      categoryLabel="内容处理"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      {/* Drag & Drop Upload */}
      <div
        className="relative border-2 border-dashed border-[var(--border)] rounded-xl p-6 text-center hover:border-[var(--accent-color)] transition-colors"
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) setImagePath((f as File & { path?: string }).path ?? f.name)
        }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setImagePath(f ? (f as File & { path?: string }).path ?? f.name : null)
          }}
        />
        {imagePath ? (
          <p className="text-sm text-[var(--text-primary)] font-medium">
            {imagePath.split("/").pop() ?? imagePath}
          </p>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)]">拖拽图片到此处，或点击选择</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">支持 PNG / JPG / WebP</p>
          </>
        )}
      </div>

      {/* Mode */}
      <div className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "flex-1 py-1.5 rounded text-xs font-medium border transition-colors",
              mode === m.value
                ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </PlazaSkillPage>
  )
}
