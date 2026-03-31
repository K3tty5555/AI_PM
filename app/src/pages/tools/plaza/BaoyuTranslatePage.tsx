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
  { code: "pt", label: "葡萄牙语" },
  { code: "ru", label: "俄语" },
  { code: "ar", label: "阿拉伯语" },
]

const MODES = [
  { value: "quick",   label: "快速",  desc: "直接翻译" },
  { value: "normal",  label: "普通",  desc: "分析后翻译" },
  { value: "refined", label: "精翻",  desc: "分析+翻译+润色" },
]

export function BaoyuTranslatePage() {
  const [text, setText] = useState("")
  const [sourceLang, setSourceLang] = useState("zh")
  const [targetLang, setTargetLang] = useState("en")
  const [mode, setMode] = useState("normal")

  const { text: output, isStreaming, error, run, reset } = useToolStream("baoyu-translate", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!text.trim()) return
    run(`${text.trim()} --from ${sourceLang} --lang ${targetLang} --mode ${mode}`)
  }

  return (
    <PlazaSkillPage
      title="翻译"
      description="三模式翻译：快速 / 普通 / 精翻，支持自定义术语"
      source="baoyu"
      category="content"
      categoryLabel="内容处理"
      onRun={handleRun}
      onClear={() => { reset(); setText("") }}
      running={isStreaming}
      output={output}
      error={error}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="粘贴要翻译的文本..."
        rows={4}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      {/* Lang Row */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">源语言</span>
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-tertiary)]">→</span>
        <span className="text-xs text-[var(--text-secondary)] shrink-0">目标语言</span>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Mode */}
      <div className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "flex-1 py-1.5 rounded text-xs font-medium border transition-colors text-center",
              mode === m.value
                ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
            )}
          >
            {m.label}<span className="ml-1 text-[10px] opacity-60">{m.desc}</span>
          </button>
        ))}
      </div>
    </PlazaSkillPage>
  )
}
