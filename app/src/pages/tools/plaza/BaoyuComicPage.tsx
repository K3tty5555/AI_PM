import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

const STYLES = [
  { label: "漫画风格", value: "manga" },
  { label: "美式漫画", value: "comic" },
  { label: "卡通萌系", value: "cartoon" },
  { label: "水彩插画", value: "watercolor" },
  { label: "极简线条", value: "minimal" },
  { label: "Logicomix 风格", value: "logicomix" },
] as const

export function BaoyuComicPage() {
  const [content, setContent] = useState("")
  const [style, setStyle] = useState<string>(STYLES[0].value)

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-comic", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    run(`${content.trim()} --style ${style}`)
  }

  return (
    <PlazaSkillPage
      title="知识漫画"
      description="多种风格的知识/教育漫画创作"
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
        placeholder="输入要转化为漫画的知识内容，例如：量子力学基础原理、编程算法故事..."
        rows={4}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      <div>
        <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">绘画风格</span>
        <div className="flex flex-wrap gap-1">
          {STYLES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStyle(s.value)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                style === s.value
                  ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </PlazaSkillPage>
  )
}
