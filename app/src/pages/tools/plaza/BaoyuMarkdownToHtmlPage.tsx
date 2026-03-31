import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"

export function BaoyuMarkdownToHtmlPage() {
  const [markdown, setMarkdown] = useState("")

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-markdown-to-html", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!markdown.trim()) return
    run(markdown.trim())
  }

  return (
    <PlazaSkillPage
      title="微信 HTML"
      description="Markdown 转微信公众号兼容 HTML（外链转底部引用）"
      source="baoyu"
      category="content"
      categoryLabel="内容处理"
      onRun={handleRun}
      onClear={() => { reset(); setMarkdown("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        placeholder="粘贴 Markdown 内容，转换为微信公众号兼容的 HTML 格式..."
        rows={6}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />
      <p className="text-xs text-[var(--text-tertiary)]">
        外部链接将自动转为文章底部引用，符合微信公众号排版规范
      </p>
    </PlazaSkillPage>
  )
}
