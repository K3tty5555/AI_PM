import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

type Audience = "通用" | "商务" | "教育" | "创意"

const AUDIENCES: Audience[] = ["通用", "商务", "教育", "创意"]

const STYLE_GROUPS = [
  {
    label: "商务专业",
    styles: [
      { value: "corporate",    desc: "正式企业风格" },
      { value: "boardroom",    desc: "高管汇报专用" },
      { value: "pitch-deck",   desc: "融资路演风格" },
      { value: "consultant",   desc: "咨询顾问报告" },
    ],
  },
  {
    label: "教育科普",
    styles: [
      { value: "academic",   desc: "学术论文风格" },
      { value: "classroom",  desc: "课堂教学适用" },
      { value: "tutorial",   desc: "教程步骤演示" },
      { value: "research",   desc: "科研汇报风格" },
    ],
  },
  {
    label: "创意视觉",
    styles: [
      { value: "creative",   desc: "自由创意设计" },
      { value: "artistic",   desc: "艺术插画风格" },
      { value: "vibrant",    desc: "鲜明对比配色" },
      { value: "editorial",  desc: "杂志排版感" },
    ],
  },
  {
    label: "简约现代",
    styles: [
      { value: "minimal",    desc: "极简留白设计" },
      { value: "clean",      desc: "清爽简洁布局" },
      { value: "flat",       desc: "扁平现代风格" },
      { value: "geometric",  desc: "几何图形设计" },
    ],
  },
]

export function BaoyuSlideDeckPage() {
  const [content, setContent] = useState("")
  const [audience, setAudience] = useState<Audience>("通用")
  const [style, setStyle] = useState<string>(STYLE_GROUPS[0].styles[0].value)
  const [slideCount, setSlideCount] = useState(8)

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-slide-deck", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    run(`${content.trim()} --style ${style} --slides ${slideCount} --audience ${audience}`)
  }

  return (
    <PlazaSkillPage
      title="图片幻灯片"
      description="每页 AI 生成图片的视觉幻灯片（16 种风格）"
      source="baoyu"
      category="document"
      categoryLabel="文档生成"
      onRun={handleRun}
      onClear={() => { reset(); setContent("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      {/* Audience */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">受众</span>
        <div className="flex gap-1">
          {AUDIENCES.map((a) => (
            <button
              key={a}
              onClick={() => setAudience(a)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                audience === a
                  ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
              )}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Style Grid */}
      <div className="space-y-2">
        <span className="text-xs text-[var(--text-secondary)]">幻灯片风格</span>
        {STYLE_GROUPS.map((group) => (
          <div key={group.label}>
            <span className="text-xs text-[var(--text-tertiary)] block mb-1">{group.label}</span>
            <div className="grid grid-cols-4 gap-1">
              {group.styles.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={cn(
                    "p-2 rounded border text-left transition-colors",
                    style === s.value
                      ? "border-[var(--accent-color)] bg-[var(--accent-light)]"
                      : "border-[var(--border)] hover:border-[var(--accent-color)]"
                  )}
                >
                  <div className={cn("text-xs font-medium", style === s.value ? "text-[var(--accent-color)]" : "text-[var(--text-primary)]")}>
                    {s.value}
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Slide Count */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">页数</span>
        <input
          type="range" min={4} max={20} value={slideCount}
          onChange={(e) => setSlideCount(Number(e.target.value))}
          className="flex-1 accent-[var(--accent-color)]"
        />
        <span className="text-sm font-medium text-[var(--text-primary)] w-6 text-center">{slideCount}</span>
      </div>

      {/* Content */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="粘贴文章、提纲或要点..."
        rows={4}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />
    </PlazaSkillPage>
  )
}
