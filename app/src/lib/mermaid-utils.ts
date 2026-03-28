// ─── Mermaid Detection & Style Recommendations ──────────────────────────────

export interface MermaidStyleRec {
  layout: string
  style: string
  label: string
}

export function detectMermaidType(code: string): string {
  const firstLine = code.trim().split("\n")[0].trim()
  for (const type of ["sequenceDiagram", "flowchart", "classDiagram", "graph"]) {
    if (firstLine.startsWith(type)) return type
  }
  return "graph"
}

export const STYLE_RECOMMENDATIONS: Record<string, MermaidStyleRec> = {
  graph:           { layout: "linear-progression", style: "corporate-memphis", label: "线性流程 × 扁平商务" },
  flowchart:       { layout: "linear-progression", style: "corporate-memphis", label: "线性流程 × 扁平商务" },
  sequenceDiagram: { layout: "linear-progression", style: "technical-schematic", label: "线性流程 × 技术图示" },
  classDiagram:    { layout: "structural-breakdown", style: "technical-schematic", label: "层级结构 × 技术图示" },
}

export interface MermaidBlock {
  index: number
  lineNumber: number
  code: string
  chartType: string
  recommendedLayout: string
  recommendedStyle: string
}

export function extractMermaidBlocks(markdown: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = []
  const regex = /```mermaid\s*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let index = 0
  while ((match = regex.exec(markdown)) !== null) {
    const lineNumber = markdown.substring(0, match.index).split("\n").length
    const code = match[1].trim()
    const chartType = detectMermaidType(code)
    const rec = STYLE_RECOMMENDATIONS[chartType] || STYLE_RECOMMENDATIONS["graph"]
    blocks.push({
      index: index++,
      lineNumber,
      code,
      chartType,
      recommendedLayout: rec.layout,
      recommendedStyle: rec.style,
    })
  }
  return blocks
}
