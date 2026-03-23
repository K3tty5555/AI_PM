import { Search, Terminal, Save, BookOpen, FileEdit, FolderSearch, FileCode, Loader } from "lucide-react"
import type { StreamMeta } from "@/lib/stream-types"

const TOOL_ICONS: Record<string, typeof Search> = {
  "正在搜索网页": Search,
  "正在获取网页内容": Search,
  "正在执行命令": Terminal,
  "正在写入文件": Save,
  "正在读取文件": BookOpen,
  "正在编辑文件": FileEdit,
  "正在查找文件": FolderSearch,
  "正在搜索代码": FileCode,
}

interface StreamProgressProps {
  isStreaming: boolean
  isThinking: boolean
  elapsedSeconds: number
  streamMeta: StreamMeta | null
  toolStatus?: string | null
}

export function StreamProgress({ isStreaming, isThinking, elapsedSeconds, streamMeta, toolStatus }: StreamProgressProps) {
  if (!isStreaming && !streamMeta) return null

  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")
  const ss = String(elapsedSeconds % 60).padStart(2, "0")

  if (isStreaming) {
    const ToolIcon = toolStatus ? (TOOL_ICONS[toolStatus] ?? Loader) : null

    return (
      <div className="flex flex-col items-center gap-1.5">
        {isThinking ? (
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-[var(--accent-color)] animate-[dotPulse_1.4s_ease-in-out_infinite]" />
            <div className="size-1.5 rounded-full bg-[var(--accent-color)] animate-[dotPulse_1.4s_ease-in-out_0.2s_infinite]" />
            <div className="size-1.5 rounded-full bg-[var(--accent-color)] animate-[dotPulse_1.4s_ease-in-out_0.4s_infinite]" />
          </div>
        ) : toolStatus ? (
          <div className="w-48 h-1 rounded-full bg-[var(--border-primary)] overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-[var(--accent-color)] animate-[shimmer_1.5s_ease-in-out_infinite]" />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 rounded-full bg-[var(--accent-color)] animate-[dotPulse_1.4s_ease-in-out_infinite]" />
            <div className="size-1.5 rounded-full bg-[var(--accent-color)] animate-[dotPulse_1.4s_ease-in-out_0.2s_infinite]" />
            <div className="size-1.5 rounded-full bg-[var(--accent-color)] animate-[dotPulse_1.4s_ease-in-out_0.4s_infinite]" />
          </div>
        )}

        <p className="text-[12px] tabular-nums text-[var(--text-tertiary)]">
          {mm}:{ss}
        </p>

        {toolStatus && ToolIcon && (
          <p className="flex items-center gap-1.5 text-[12px] text-[var(--accent-color)]" aria-live="polite">
            <ToolIcon className="size-3.5" />
            <span>{toolStatus}...</span>
          </p>
        )}
      </div>
    )
  }

  if (streamMeta) {
    return (
      <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">
        {streamMeta.inputTokens != null && streamMeta.outputTokens != null
          ? `API 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s · 输入 ${streamMeta.inputTokens.toLocaleString()} tokens · 输出 ${streamMeta.outputTokens.toLocaleString()} tokens`
            + (streamMeta.costUsd != null ? ` · $${streamMeta.costUsd.toFixed(4)}` : "")
          : `CLI 模式：耗时 ${(streamMeta.durationMs / 1000).toFixed(1)}s`
            + (streamMeta.costUsd != null ? ` · $${streamMeta.costUsd.toFixed(4)}` : "")}
      </p>
    )
  }

  return null
}
