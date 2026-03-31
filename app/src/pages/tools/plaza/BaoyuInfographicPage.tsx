import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"

const LAYOUTS = [
  "timeline", "comparison", "process", "hierarchy",
  "statistics", "feature-list", "roadmap", "matrix",
  "cycle", "funnel", "pyramid", "mindmap",
  "checklist", "swot", "kanban", "flowchart",
  "network", "venn", "bubble", "heatmap", "scorecard",
]

export function BaoyuInfographicPage() {
  const [content, setContent] = useState("")
  const [layout, setLayout] = useState(LAYOUTS[0])

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-infographic", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    run(`${content.trim()} --layout ${layout}`)
  }

  return (
    <PlazaSkillPage
      title="信息图"
      description="21 种布局的专业信息图生成"
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
        placeholder="输入要可视化的内容，例如产品特性对比、流程步骤、数据统计..."
        rows={4}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-secondary)] shrink-0">布局类型</span>
        <select
          value={layout}
          onChange={(e) => setLayout(e.target.value)}
          className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
        >
          {LAYOUTS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>
    </PlazaSkillPage>
  )
}
