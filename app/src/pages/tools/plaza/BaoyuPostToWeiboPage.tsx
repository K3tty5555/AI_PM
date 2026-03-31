import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

type WeiboType = "post" | "article"

export function BaoyuPostToWeiboPage() {
  const [content, setContent] = useState("")
  const [type, setType] = useState<WeiboType>("post")
  const [imagePaths, setImagePaths] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-post-to-weibo", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    let input = content.trim()
    if (type === "article") input += " --article"
    imagePaths.forEach((p) => { input += ` --image "${p}"` })
    run(input)
  }

  function handleClear() {
    reset()
    setContent("")
    setImagePaths([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <PlazaSkillPage
      title="发布微博"
      description="发布文字 / 图片 / 视频到微博，支持头条文章"
      source="baoyu"
      category="social"
      categoryLabel="社交发布"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] w-fit">
        {(["post", "article"] as WeiboType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-colors",
              type === t
                ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {t === "post" ? "普通微博" : "头条文章"}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={type === "post" ? "微博内容（建议 140 字内）..." : "头条文章 Markdown 内容..."}
        rows={type === "article" ? 6 : 3}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      {type === "post" && (
        <div>
          <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">配图（可多选）</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text-primary)] file:cursor-pointer"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              setImagePaths(files.map((f) => (f as File & { path?: string }).path ?? f.name))
            }}
          />
        </div>
      )}
    </PlazaSkillPage>
  )
}
