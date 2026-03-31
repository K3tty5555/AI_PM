import { type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import { PrdViewer } from "@/components/prd-viewer"
import { api } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

const SOURCE_COLORS: Record<string, string> = {
  baoyu:   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  minimax: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
}

export interface PlazaSkillPageProps {
  title: string
  description: string
  source: "baoyu" | "minimax"
  category: string
  categoryLabel: string
  children: ReactNode
  onRun: () => void
  onClear?: () => void
  running: boolean
  output: string
  outputFiles?: string[]
  error: string | null
}

export function PlazaSkillPage({
  title, description, source, category, categoryLabel,
  children, onRun, onClear,
  running, output, outputFiles, error,
}: PlazaSkillPageProps) {
  const progressValue = running ? Math.min(90, Math.floor(output.length / 20)) : output ? 100 : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-[var(--border)]">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] mb-2">
          <Link to="/tools/plaza" className="hover:text-[var(--accent-color)]">功能广场</Link>
          <ChevronRight className="size-3" />
          <Link to={`/tools/plaza?category=${category}`} className="hover:text-[var(--accent-color)]">
            {categoryLabel}
          </Link>
          <ChevronRight className="size-3" />
          <span className="text-[var(--text-secondary)]">{title}</span>
        </nav>

        {/* Title row */}
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h1>
          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", SOURCE_COLORS[source])}>
            {source === "baoyu" ? "baoyu" : "MiniMax"}
          </span>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">{description}</p>
      </div>

      {/* Input Panel */}
      <div className="shrink-0 px-6 py-4 border-b border-[var(--border)] space-y-3">
        {children}
        <div className="flex gap-2">
          <Button onClick={onRun} disabled={running} className="flex-1">
            {running
              ? <><span className="size-4 mr-2 animate-spin border-2 border-white/30 border-t-white rounded-full inline-block" />执行中...</>
              : "执行"
            }
          </Button>
          {onClear && (
            <Button variant="ghost" onClick={onClear} disabled={running}>清空</Button>
          )}
        </div>
        {running && (
          <ProgressBar value={progressValue} animated={running} />
        )}
      </div>

      {/* Output Panel */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="text-sm text-[var(--destructive)] bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-3">
            {error}
          </div>
        )}
        {outputFiles && outputFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {outputFiles.map((f) => (
              <Button
                key={f}
                size="sm"
                variant="outline"
                onClick={() => api.revealFile(f)}
              >
                查看文件：{f.split("/").pop()}
              </Button>
            ))}
          </div>
        )}
        {output ? (
          <PrdViewer markdown={output} isStreaming={running} />
        ) : !error && !running ? (
          <p className="text-sm text-[var(--text-tertiary)] text-center mt-8">
            填写输入后点击「执行」
          </p>
        ) : null}
      </div>
    </div>
  )
}
