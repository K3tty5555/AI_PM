import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

const COVER_STYLES = [
  "modern-blue", "classic-black", "elegant-purple", "vibrant-orange",
  "minimal-white", "tech-dark", "nature-green", "warm-gradient",
  "corporate-navy", "creative-pink", "editorial-red", "academic-brown",
  "startup-teal", "luxury-gold", "clean-gray",
]

export function MinimaxPdfPage() {
  const [content, setContent] = useState("")
  const [coverStyle, setCoverStyle] = useState(COVER_STYLES[0])

  const { text, isStreaming, error, run, reset } = useToolStream("minimax-pdf", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    run(`${content.trim()} --cover-style ${coverStyle}`)
  }

  return (
    <PlazaSkillPage
      title="PDF 生成"
      description="15 种封面样式的专业 PDF 文档"
      source="minimax"
      category="document"
      categoryLabel="文档生成"
      onRun={handleRun}
      onClear={() => { reset(); setContent("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="输入 Markdown 或文本内容，生成专业 PDF 文档..."
        rows={5}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      <div>
        <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">封面样式</span>
        <div className="grid grid-cols-5 gap-1">
          {COVER_STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setCoverStyle(s)}
              className={cn(
                "px-2 py-1.5 rounded text-[10px] font-medium border transition-colors text-center leading-tight",
                coverStyle === s
                  ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
              )}
            >
              {s.split("-").join(" ")}
            </button>
          ))}
        </div>
      </div>
    </PlazaSkillPage>
  )
}
