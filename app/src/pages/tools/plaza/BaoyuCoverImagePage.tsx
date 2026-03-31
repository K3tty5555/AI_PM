import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

const ASPECT_OPTIONS = [
  { label: "电影宽屏", value: "2.35:1" },
  { label: "16:9", value: "16:9" },
  { label: "正方形", value: "1:1" },
] as const

type AspectOption = typeof ASPECT_OPTIONS[number]["value"]

export function BaoyuCoverImagePage() {
  const [content, setContent] = useState("")
  const [aspect, setAspect] = useState<AspectOption>("16:9")

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-cover-image", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    run(`${content.trim()} --aspect ${aspect}`)
  }

  return (
    <PlazaSkillPage
      title="文章封面"
      description="生成高质量文章封面图（16:9 / 1:1）"
      source="baoyu"
      category="image"
      categoryLabel="图像创作"
      onRun={handleRun}
      onClear={() => { reset(); setContent("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="输入文章标题或描述，例如：《AI 改变世界的十个方式》"
        rows={3}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">封面比例</span>
        <div className="flex gap-1">
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAspect(opt.value)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                aspect === opt.value
                  ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </PlazaSkillPage>
  )
}
