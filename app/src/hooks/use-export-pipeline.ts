import { useState, useCallback } from "react"
import { api, type SensitiveMatch, type PlaceholderMatch } from "@/lib/tauri-api"
import { extractMermaidBlocks, type MermaidBlock } from "@/lib/mermaid-utils"
import type { ExportPreflightOptions } from "@/components/export-preflight-dialog"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineState = "idle" | "scanning" | "preflight" | "exporting" | "done" | "error"

export interface ExportPipelineReturn {
  // State
  state: PipelineState
  sensitiveMatches: SensitiveMatch[]
  placeholderMatches: PlaceholderMatch[]
  mermaidBlocks: MermaidBlock[]
  preflightOpen: boolean
  exporting: boolean
  exportResult: { path: string } | { error: string } | null

  // Actions
  startExport: (exportFn: (options?: ExportPreflightOptions) => Promise<{ path: string }>) => void
  confirmPreflight: (options: ExportPreflightOptions) => void
  cancel: () => void
  reset: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExportPipeline(projectId: string, markdown: string | null): ExportPipelineReturn {
  const [state, setState] = useState<PipelineState>("idle")
  const [sensitiveMatches, setSensitiveMatches] = useState<SensitiveMatch[]>([])
  const [placeholderMatches, setPlaceholderMatches] = useState<PlaceholderMatch[]>([])
  const [mermaidBlocks, setMermaidBlocks] = useState<MermaidBlock[]>([])
  const [exportResult, setExportResult] = useState<{ path: string } | { error: string } | null>(null)
  const [pendingExportFn, setPendingExportFn] = useState<((options?: ExportPreflightOptions) => Promise<{ path: string }>) | null>(null)

  const resetAll = useCallback(() => {
    setState("idle")
    setSensitiveMatches([])
    setPlaceholderMatches([])
    setMermaidBlocks([])
    setExportResult(null)
    setPendingExportFn(null)
  }, [])

  const startExport = useCallback(
    (exportFn: (options?: ExportPreflightOptions) => Promise<{ path: string }>) => {
      setState("scanning")
      setPendingExportFn(() => exportFn)

      // Parallel preflight: sensitive scan + placeholder scan + mermaid detection
      const sensitivePromise = Promise.race([
        api.scanSensitive(projectId),
        new Promise<SensitiveMatch[]>((_, reject) => setTimeout(() => reject("timeout"), 10000)),
      ]).catch(() => [] as SensitiveMatch[])

      const placeholderPromise = Promise.race([
        api.scanPlaceholders(projectId),
        new Promise<PlaceholderMatch[]>((_, reject) => setTimeout(() => reject("timeout"), 10000)),
      ]).catch(() => [] as PlaceholderMatch[])

      Promise.all([sensitivePromise, placeholderPromise]).then(([sensitive, placeholders]) => {
        const blocks = extractMermaidBlocks(markdown || "")

        const hasIssues = sensitive.length > 0 || placeholders.length > 0 || blocks.length > 0

        if (hasIssues) {
          setSensitiveMatches(sensitive)
          setPlaceholderMatches(placeholders)
          setMermaidBlocks(blocks)
          setState("preflight")
        } else {
          // No issues — export directly
          setState("exporting")
          exportFn()
            .then((result) => {
              setExportResult(result)
              setState("done")
            })
            .catch((err) => {
              setExportResult({ error: typeof err === "string" ? err : String(err) })
              setState("error")
            })
        }
      })
    },
    [projectId, markdown],
  )

  const confirmPreflight = useCallback(
    (options: ExportPreflightOptions) => {
      if (!pendingExportFn) return
      setState("exporting")
      pendingExportFn(options)
        .then((result) => {
          setExportResult(result)
          setState("done")
        })
        .catch((err) => {
          setExportResult({ error: typeof err === "string" ? err : String(err) })
          setState("error")
        })
        .finally(() => {
          setSensitiveMatches([])
          setPlaceholderMatches([])
          setMermaidBlocks([])
          setPendingExportFn(null)
        })
    },
    [pendingExportFn],
  )

  const cancel = useCallback(() => {
    resetAll()
  }, [resetAll])

  return {
    state,
    sensitiveMatches,
    placeholderMatches,
    mermaidBlocks,
    preflightOpen: state === "preflight",
    exporting: state === "scanning" || state === "exporting",
    exportResult,
    startExport,
    confirmPreflight,
    cancel,
    reset: resetAll,
  }
}
