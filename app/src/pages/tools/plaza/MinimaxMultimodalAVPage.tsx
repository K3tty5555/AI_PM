import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

type AVMode = "video" | "music" | "tts"

const VIDEO_DURATIONS = ["5s", "10s", "15s", "30s"]
const MUSIC_TYPES = [
  { value: "song",          label: "歌曲" },
  { value: "instrumental",  label: "纯音乐" },
]
const TTS_VOICES = ["中文女声", "中文男声", "英文女声", "英文男声", "粤语女声"]

export function MinimaxMultimodalAVPage() {
  const [mode, setMode] = useState<AVMode>("video")

  // Video
  const [videoPrompt, setVideoPrompt] = useState("")
  const [videoRefPath, setVideoRefPath] = useState<string | null>(null)
  const [videoDuration, setVideoDuration] = useState("10s")
  const videoFileRef = useRef<HTMLInputElement>(null)

  // Music
  const [musicText, setMusicText] = useState("")
  const [musicType, setMusicType] = useState("song")

  // TTS
  const [ttsText, setTtsText] = useState("")
  const [ttsVoice, setTtsVoice] = useState(TTS_VOICES[0])
  const [ttsSpeed, setTtsSpeed] = useState(1.0)

  const { text, isStreaming, error, run, reset } = useToolStream("minimax-multimodal-video", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    let input = `--mode ${mode} `
    if (mode === "video") {
      if (!videoPrompt.trim()) return
      input += `--duration ${videoDuration} "${videoPrompt.trim()}"`
      if (videoRefPath) input += ` --ref "${videoRefPath}"`
    } else if (mode === "music") {
      if (!musicText.trim()) return
      input += `--type ${musicType} "${musicText.trim()}"`
    } else {
      if (!ttsText.trim()) return
      input += `--voice "${ttsVoice}" --speed ${ttsSpeed} "${ttsText.trim()}"`
    }
    run(input)
  }

  function handleClear() {
    reset()
    setVideoPrompt("")
    setVideoRefPath(null)
    setMusicText("")
    setTtsText("")
    if (videoFileRef.current) videoFileRef.current.value = ""
  }

  const modeLabel = { video: "视频生成", music: "音乐生成", tts: "TTS 语音" }

  return (
    <PlazaSkillPage
      title="语音 & 音乐 & 视频"
      description="文生视频、图生视频、TTS 语音合成、音乐生成"
      source="minimax"
      category="video"
      categoryLabel="视频音频"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      {/* Mode Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-secondary)]">
        {(["video", "music", "tts"] as AVMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors",
              mode === m
                ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {modeLabel[m]}
          </button>
        ))}
      </div>

      {/* Video Mode */}
      {mode === "video" && (
        <>
          <textarea
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            placeholder="描述视频内容，例如：一只橙色的猫在阳光下伸懒腰..."
            rows={3}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)] shrink-0">时长</span>
            <div className="flex gap-1">
              {VIDEO_DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setVideoDuration(d)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                    videoDuration === d
                      ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">参考图（图生视频，可选）</span>
            <input
              ref={videoFileRef}
              type="file"
              accept="image/*"
              className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text-primary)] file:cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0]
                setVideoRefPath(f ? (f as File & { path?: string }).path ?? f.name : null)
              }}
            />
          </div>
        </>
      )}

      {/* Music Mode */}
      {mode === "music" && (
        <>
          <textarea
            value={musicText}
            onChange={(e) => setMusicText(e.target.value)}
            placeholder="描述音乐风格，或输入歌词/作词要求..."
            rows={4}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
          />
          <div className="flex gap-1">
            {MUSIC_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setMusicType(t.value)}
                className={cn(
                  "px-3 py-1.5 rounded text-xs font-medium border transition-colors",
                  musicType === t.value
                    ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* TTS Mode */}
      {mode === "tts" && (
        <>
          <textarea
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            placeholder="输入要转为语音的文本..."
            rows={3}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)] shrink-0">音色</span>
            <select
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
            >
              {TTS_VOICES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-secondary)] shrink-0">语速</span>
            <input
              type="range" min={0.5} max={2.0} step={0.1} value={ttsSpeed}
              onChange={(e) => setTtsSpeed(Number(e.target.value))}
              className="flex-1 accent-[var(--accent-color)]"
            />
            <span className="text-sm font-medium text-[var(--text-primary)] w-8 text-center">{ttsSpeed.toFixed(1)}x</span>
          </div>
        </>
      )}
    </PlazaSkillPage>
  )
}
