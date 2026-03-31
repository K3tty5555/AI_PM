import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

const ASPECT_RATIOS = ["1:1", "16:9", "4:3", "9:16"] as const
type AspectRatio = typeof ASPECT_RATIOS[number]

export function BaoyuImaginePage() {
  const [prompt, setPrompt] = useState("")
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1")
  const [refImagePath, setRefImagePath] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-imagine", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!prompt.trim()) return
    let input = `${prompt.trim()} --ar ${aspectRatio}`
    if (refImagePath) input += ` --ref "${refImagePath}"`
    run(input)
  }

  function handleClear() {
    reset()
    setPrompt("")
    setRefImagePath(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <PlazaSkillPage
      title="AI 文生图"
      description="多服务商 AI 文生图，支持参考图和多种比例"
      source="baoyu"
      category="image"
      categoryLabel="图像创作"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      {/* Prompt */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="描述你想要的图片..."
        rows={3}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      {/* Aspect Ratio */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">比例</span>
        <div className="flex gap-1">
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              onClick={() => setAspectRatio(r)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                aspectRatio === r
                  ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Ref Image */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">参考图（可选）</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="text-xs text-[var(--text-secondary)] file:mr-2 file:rounded file:border-0 file:bg-[var(--bg-secondary)] file:px-2 file:py-1 file:text-xs file:text-[var(--text-primary)]"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setRefImagePath(f ? (f as File & { path?: string }).path ?? f.name : null)
          }}
        />
        {refImagePath && (
          <button
            onClick={() => {
              setRefImagePath(null)
              if (fileInputRef.current) fileInputRef.current.value = ""
            }}
            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--destructive)]"
          >
            移除
          </button>
        )}
      </div>
    </PlazaSkillPage>
  )
}
