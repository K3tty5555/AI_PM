import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

type Mode = "text2img" | "img2img"

export function MinimaxImagePage() {
  const [mode, setMode] = useState<Mode>("text2img")
  const [prompt, setPrompt] = useState("")
  const [refImagePath, setRefImagePath] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { text, isStreaming, error, run, reset } = useToolStream("minimax-multimodal-image", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!prompt.trim()) return
    let input = `--mode image "${prompt.trim()}"`
    if (mode === "img2img" && refImagePath) {
      input += ` --ref "${refImagePath}"`
    }
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
      title="MiniMax 图像"
      description="MiniMax 文生图 / 图生图（含角色参考）"
      source="minimax"
      category="image"
      categoryLabel="图像创作"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      {/* Mode Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] w-fit">
        {(["text2img", "img2img"] as Mode[]).map((m) => (
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
            {m === "text2img" ? "文生图" : "图生图"}
          </button>
        ))}
      </div>

      {/* Prompt */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="描述要生成的图片..."
        rows={3}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      {/* Ref Image (img2img only) */}
      {mode === "img2img" && (
        <div>
          <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">参考图</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text-primary)] file:cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0]
              setRefImagePath(f ? (f as File & { path?: string }).path ?? f.name : null)
            }}
          />
        </div>
      )}
    </PlazaSkillPage>
  )
}
