import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"

export function BaoyuArticleIllustratorPage() {
  const [article, setArticle] = useState("")

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-article-illustrator", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!article.trim()) return
    run(article.trim())
  }

  return (
    <PlazaSkillPage
      title="文章配图"
      description="分析文章结构，为每个段落生成插图"
      source="baoyu"
      category="image"
      categoryLabel="图像创作"
      onRun={handleRun}
      onClear={() => { reset(); setArticle("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      <textarea
        value={article}
        onChange={(e) => setArticle(e.target.value)}
        placeholder="粘贴文章内容（支持 Markdown），AI 将分析结构并为每个段落生成插图..."
        rows={6}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />
      <p className="text-xs text-[var(--text-tertiary)]">
        提示：配图过程较长，每张图约 10–30 秒，整篇文章可能需要数分钟
      </p>
    </PlazaSkillPage>
  )
}
