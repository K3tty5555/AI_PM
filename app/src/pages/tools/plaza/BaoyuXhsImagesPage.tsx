import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"
import { cn } from "@/lib/utils"

const STYLES = [
  "卡通可爱", "简约线条", "写实插画", "水彩风格",
  "扁平设计", "复古风", "国潮风", "赛博朋克",
  "治愈系", "波普艺术", "像素风", "极简主义",
]

export function BaoyuXhsImagesPage() {
  const [content, setContent] = useState("")
  const [style, setStyle] = useState<string>(STYLES[0])
  const [count, setCount] = useState(4)

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-xhs-images", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    run(`${content.trim()} --style "${style}" --count ${count}`)
  }

  return (
    <PlazaSkillPage
      title="小红书图片"
      description="生成小红书风格系列图片（1-10 张）"
      source="baoyu"
      category="image"
      categoryLabel="图像创作"
      onRun={handleRun}
      onClear={() => { reset(); setContent("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="输入内容主题，例如：健康早餐食谱、旅行打卡攻略..."
        rows={3}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      {/* Style Grid */}
      <div>
        <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">图片风格</span>
        <div className="grid grid-cols-4 gap-1">
          {STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={cn(
                "px-2 py-1.5 rounded text-xs font-medium border transition-colors text-center",
                style === s
                  ? "border-[var(--accent-color)] bg-[var(--accent-light)] text-[var(--accent-color)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">张数</span>
        <input
          type="range"
          min={1}
          max={10}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="flex-1 accent-[var(--accent-color)]"
        />
        <span className="text-sm font-medium text-[var(--text-primary)] w-6 text-center">{count}</span>
      </div>
    </PlazaSkillPage>
  )
}
