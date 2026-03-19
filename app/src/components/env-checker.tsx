import { useState, useEffect, useRef, useCallback } from "react"
import { listen } from "@tauri-apps/api/event"
import { CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api, type DepStatus } from "@/lib/tauri-api"
import { cn } from "@/lib/utils"

// ── Types ────────────────────────────────────────────────────────────────────

type InstallState = "idle" | "installing" | "done" | "error"

interface DepInstallState {
  state: InstallState
  log: string
}

// ── EnvChecker ───────────────────────────────────────────────────────────────

export function EnvChecker() {
  const [deps, setDeps] = useState<DepStatus[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [useMirror, setUseMirror] = useState(true)
  const [installStates, setInstallStates] = useState<Record<string, DepInstallState>>({})
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  const checkAll = useCallback(async () => {
    setChecking(true)
    try {
      const result = await api.checkEnv()
      setDeps(result)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => { checkAll() }, [checkAll])

  // Scroll log to bottom when new content arrives
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [installStates])

  const handleInstall = useCallback(async (dep: DepStatus) => {
    setInstallStates(prev => ({
      ...prev,
      [dep.name]: { state: "installing", log: "" },
    }))
    setExpandedLog(dep.name)

    // Subscribe to progress events
    const unlisten = await listen<string>("install_progress", (e) => {
      setInstallStates(prev => ({
        ...prev,
        [dep.name]: {
          ...prev[dep.name],
          log: (prev[dep.name]?.log ?? "") + e.payload,
        },
      }))
    })

    // Subscribe to done event
    const unlistenDone = await listen<{ ok: boolean; dep: string; error?: string }>(
      "install_done",
      (e) => {
        if (e.payload.dep === dep.name) {
          setInstallStates(prev => ({
            ...prev,
            [dep.name]: {
              ...prev[dep.name],
              state: e.payload.ok ? "done" : "error",
            },
          }))
          unlisten()
          unlistenDone()
          // Re-check env after install
          if (e.payload.ok) {
            setTimeout(checkAll, 800)
          }
        }
      }
    )

    try {
      await api.installDep(dep.name, useMirror)
    } catch {
      // error is emitted via install_done event
    }
  }, [useMirror, checkAll])

  const anyInstalling = Object.values(installStates).some(s => s.state === "installing")

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setUseMirror(v => !v)}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span
              className={cn(
                "inline-flex h-4 w-7 items-center rounded-full px-0.5 transition-colors duration-200",
                useMirror ? "bg-[var(--accent-color)]" : "bg-[var(--border)]"
              )}
            >
              <span
                className={cn(
                  "size-3 rounded-full bg-white shadow transition-transform duration-200",
                  useMirror ? "translate-x-3" : "translate-x-0"
                )}
              />
            </span>
            国内镜像
          </button>
          {useMirror && (
            <span className="text-xs text-[var(--text-tertiary)]">
              pip → 清华 · npm → 淘宝
            </span>
          )}
        </div>
        <button
          onClick={checkAll}
          disabled={checking || anyInstalling}
          className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("size-3", checking && "animate-spin")} />
          刷新检测
        </button>
      </div>

      {/* Dep list */}
      {checking && !deps ? (
        <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="size-4 animate-spin" />
          检测中...
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {(deps ?? []).map(dep => {
            const is = installStates[dep.name]
            const installing = is?.state === "installing"
            const installDone = is?.state === "done"
            const installError = is?.state === "error"

            return (
              <li key={dep.name} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  {/* Status icon */}
                  <span className="shrink-0">
                    {installing ? (
                      <Loader2 className="size-4 animate-spin text-[var(--accent-color)]" />
                    ) : dep.installed || installDone ? (
                      <CheckCircle2 className="size-4 text-[var(--success)]" />
                    ) : (
                      <XCircle className={cn("size-4", dep.required ? "text-[var(--destructive)]" : "text-[var(--text-tertiary)]")} />
                    )}
                  </span>

                  {/* Label + version */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-[var(--text-primary)]">{dep.label}</span>
                      {!dep.required && (
                        <span className="text-[11px] text-[var(--text-tertiary)]">可选</span>
                      )}
                    </div>
                    <span className="text-[12px] text-[var(--text-tertiary)]">
                      {dep.installed && dep.version ? dep.version : dep.featureHint}
                    </span>
                    {installError && (
                      <span className="text-[12px] text-[var(--destructive)]">安装失败</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-2">
                    {!dep.installed && !installDone && (
                      dep.autoInstallable ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleInstall(dep)}
                          disabled={installing || anyInstalling}
                          className="h-7 px-2 text-xs"
                        >
                          {installing ? "安装中..." : installError ? "重试" : "安装"}
                        </Button>
                      ) : dep.manualHint ? (
                        <span className="text-[12px] text-[var(--text-tertiary)] max-w-[180px] text-right">
                          {dep.manualHint.startsWith("请访问") || dep.manualHint.startsWith("需要先") ? (
                            <a
                              href={dep.manualHint.match(/https?:\/\/\S+/)?.[0]}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-[var(--accent-color)] hover:opacity-70"
                            >
                              手动安装 <ExternalLink className="size-2.5" />
                            </a>
                          ) : (
                            dep.manualHint
                          )}
                        </span>
                      ) : null
                    )}

                    {/* Log toggle */}
                    {is?.log && (
                      <button
                        onClick={() => setExpandedLog(expandedLog === dep.name ? null : dep.name)}
                        className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        {expandedLog === dep.name ? "收起" : "日志"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Install log */}
                {expandedLog === dep.name && is?.log && (
                  <pre
                    ref={logRef}
                    className={cn(
                      "mt-2 max-h-[140px] overflow-y-auto rounded-md",
                      "bg-[var(--secondary)] px-3 py-2",
                      "text-[11px] leading-relaxed text-[var(--text-secondary)]",
                      "font-mono whitespace-pre-wrap break-all",
                    )}
                  >
                    {is.log}
                  </pre>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
