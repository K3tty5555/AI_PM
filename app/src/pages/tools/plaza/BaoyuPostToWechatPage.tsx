import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

type PostType = "article" | "image-text"

export function BaoyuPostToWechatPage() {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [postType, setPostType] = useState<PostType>("article")

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-post-to-wechat", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    let input = `--type ${postType}`
    if (title.trim()) input += ` --title "${title.trim()}"`
    input += `\n\n${content.trim()}`
    run(input)
  }

  return (
    <PlazaSkillPage
      title="发布公众号"
      description="将 HTML/Markdown 文章发布到微信公众号"
      source="baoyu"
      category="social"
      categoryLabel="社交发布"
      onRun={handleRun}
      onClear={() => { reset(); setTitle(""); setContent("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      {/* Post Type */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] w-fit">
        {(["article", "image-text"] as PostType[]).map((t) => (
          <button
            key={t}
            onClick={() => setPostType(t)}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-colors",
              postType === t
                ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {t === "article" ? "文章" : "贴图/图文"}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="文章标题（可选）"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="粘贴 Markdown 或 HTML 内容..."
        rows={5}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />
    </PlazaSkillPage>
  )
}
