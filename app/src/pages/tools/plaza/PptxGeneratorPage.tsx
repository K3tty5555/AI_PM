import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"

const COLOR_SCHEMES = [
  "professional-blue", "corporate-gray", "vibrant-green",
  "elegant-purple", "warm-orange", "minimal-white",
]

export function PptxGeneratorPage() {
  const [content, setContent] = useState("")
  const [colorScheme, setColorScheme] = useState(COLOR_SCHEMES[0])

  const { text, isStreaming, error, run, reset } = useToolStream("pptx-generator", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    run(`${content.trim()} --color-scheme ${colorScheme}`)
  }

  return (
    <PlazaSkillPage
      title="PPT 生成"
      description="PptxGenJS 驱动，可编辑的 PowerPoint 文件"
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
        placeholder="粘贴 Markdown 内容或大纲，AI 将生成 PowerPoint 文件..."
        rows={5}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">配色方案</span>
        <select
          value={colorScheme}
          onChange={(e) => setColorScheme(e.target.value)}
          className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
        >
          {COLOR_SCHEMES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </PlazaSkillPage>
  )
}
