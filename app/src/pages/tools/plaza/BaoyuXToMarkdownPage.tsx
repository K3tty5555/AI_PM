import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"

export function BaoyuXToMarkdownPage() {
  const [url, setUrl] = useState("")
  const [consented, setConsented] = useState(false)

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-danger-x-to-markdown", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!url.trim() || !consented) return
    run(url.trim())
  }

  return (
    <PlazaSkillPage
      title="推文转 Markdown"
      description="X 推文 / 文章转 Markdown（含 YAML 元数据）"
      source="baoyu"
      category="social"
      categoryLabel="社交发布"
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
        placeholder="https://x.com/username/status/..."
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-2">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          此功能使用 X 平台的逆向工程 API，仅供个人研究使用。使用前请确认你了解相关风险和平台使用条款。
        </p>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="rounded accent-amber-600"
          />
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">我了解并同意使用条款</span>
        </label>
      </div>
    </PlazaSkillPage>
  )
}
