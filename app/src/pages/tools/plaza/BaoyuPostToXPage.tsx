import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"

export function BaoyuPostToXPage() {
  const [content, setContent] = useState("")
  const [isArticle, setIsArticle] = useState(false)
  const [mediaPaths, setMediaPaths] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-post-to-x", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    let input = content.trim()
    if (isArticle) input += " --article"
    mediaPaths.forEach((p) => { input += ` --media "${p}"` })
    run(input)
  }

  function handleClear() {
    reset()
    setContent("")
    setMediaPaths([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const charCount = content.length
  const overLimit = !isArticle && charCount > 280

  return (
    <PlazaSkillPage
      title="发布 X"
      description="发布推文 / X Articles 长文到 X（Twitter）"
      source="baoyu"
      category="social"
      categoryLabel="社交发布"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={isArticle ? "X Articles 长文内容（Markdown）..." : "推文内容..."}
          rows={isArticle ? 6 : 3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 pr-16 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
        />
        {!isArticle && (
          <span className={`absolute bottom-2 right-3 text-xs ${overLimit ? "text-[var(--destructive)]" : "text-[var(--text-tertiary)]"}`}>
            {charCount}/280
          </span>
        )}
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isArticle}
          onChange={(e) => setIsArticle(e.target.checked)}
          className="rounded accent-[var(--accent-color)]"
        />
        <span className="text-xs text-[var(--text-secondary)]">X Articles 长文模式</span>
      </label>

      {!isArticle && (
        <div>
          <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">媒体附件（可选）</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text-primary)] file:cursor-pointer"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              setMediaPaths(files.map((f) => (f as File & { path?: string }).path ?? f.name))
            }}
          />
        </div>
      )}
    </PlazaSkillPage>
  )
}
