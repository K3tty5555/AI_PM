import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

const LANGUAGES = [
  { code: "zh", label: "中文" },
  { code: "en", label: "英语" },
  { code: "ja", label: "日语" },
  { code: "ko", label: "韩语" },
  { code: "fr", label: "法语" },
  { code: "de", label: "德语" },
  { code: "es", label: "西班牙语" },
  { code: "auto", label: "自动检测" },
]

type ContentType = "transcript" | "cover"

export function BaoyuYoutubeTranscriptPage() {
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [language, setLanguage] = useState("auto")
  const [contentType, setContentType] = useState<ContentType>("transcript")

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-youtube-transcript", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!youtubeUrl.trim()) return
    let input = youtubeUrl.trim()
    if (language !== "auto") input += ` --lang ${language}`
    if (contentType === "cover") input += " --cover"
    run(input)
  }

  return (
    <PlazaSkillPage
      title="YouTube 字幕"
      description="提取 YouTube 视频字幕、封面图，支持多语言"
      source="baoyu"
      category="content"
      categoryLabel="内容处理"
      onRun={handleRun}
      onClear={() => { reset(); setYoutubeUrl("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      <input
        type="url"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      {/* Type */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] w-fit">
        {(["transcript", "cover"] as ContentType[]).map((t) => (
          <button
            key={t}
            onClick={() => setContentType(t)}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-colors",
              contentType === t
                ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {t === "transcript" ? "字幕提取" : "封面图"}
          </button>
        ))}
      </div>

      {contentType === "transcript" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)] shrink-0">字幕语言</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      )}
    </PlazaSkillPage>
  )
}
