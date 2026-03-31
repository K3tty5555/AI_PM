import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"

export function BaoyuUrlToMarkdownPage() {
  const [url, setUrl] = useState("")
  const [waitMode, setWaitMode] = useState(false)

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-url-to-markdown", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!url.trim()) return
    let input = url.trim()
    if (waitMode) input += " --wait"
    run(input)
  }

  return (
    <PlazaSkillPage
      title="网页转 Markdown"
      description="Chrome CDP 渲染网页，转为干净 Markdown"
      source="baoyu"
      category="content"
      categoryLabel="内容处理"
      onRun={handleRun}
      onClear={() => { reset(); setUrl("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/article"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={waitMode}
          onChange={(e) => setWaitMode(e.target.checked)}
          className="rounded accent-[var(--accent-color)]"
        />
        <span className="text-xs text-[var(--text-secondary)]">
          等待信号模式（页面需要登录时开启）
        </span>
      </label>
    </PlazaSkillPage>
  )
}
