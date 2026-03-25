import { useEffect, useState, useCallback } from "react"
import { Loader2, CheckCircle2, XCircle, FolderOpen } from "lucide-react"
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { api } from "@/lib/tauri-api"

export function SettingsProject() {
  // Projects dir state
  const [projectsDir, setProjectsDir] = useState("")
  const [contextMemoryEnabled, setContextMemoryEnabled] = useState(
    () => localStorage.getItem("context-memory-enabled") !== "0"
  )
  const [projectsDirDirty, setProjectsDirDirty] = useState(false)
  const [savingDir, setSavingDir] = useState(false)
  const [dirSaveResult, setDirSaveResult] = useState<{ ok: boolean; message: string } | null>(null)

  const loadProjectsDir = useCallback(async () => {
    try {
      const dir = await api.getProjectsDir()
      setProjectsDir(dir)
    } catch (err) {
      console.error("Failed to fetch projects dir:", err)
    }
  }, [])

  useEffect(() => {
    loadProjectsDir()
  }, [loadProjectsDir])

  const handlePickDir = async () => {
    const selected = await dialogOpen({ directory: true, multiple: false })
    if (selected && typeof selected === "string") {
      setProjectsDir(selected)
      setProjectsDirDirty(true)
      setDirSaveResult(null)
    }
  }

  const handleSaveDir = async () => {
    if (!projectsDir) return
    setSavingDir(true)
    setDirSaveResult(null)
    try {
      await api.saveProjectsDir(projectsDir)
      setDirSaveResult({ ok: true, message: "已保存，重启后新项目将存入此目录" })
      setProjectsDirDirty(false)
    } catch (err) {
      setDirSaveResult({ ok: false, message: typeof err === "string" ? err : "保存失败" })
    } finally {
      setSavingDir(false)
    }
  }

  return (
    <>
    <Card className="hover:shadow-none">
      <CardHeader>
        <CardTitle>项目目录</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--text-primary)]">
            项目文件存储目录
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={projectsDir}
              onChange={(e) => {
                setProjectsDir(e.target.value)
                setProjectsDirDirty(true)
                setDirSaveResult(null)
              }}
              placeholder="~/Documents/AI PM"
              className="h-9 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors duration-200 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
            />
            <Button variant="ghost" size="sm" onClick={handlePickDir} className="gap-1.5 shrink-0">
              <FolderOpen className="size-4" />
              选择
            </Button>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">
            所有项目的 PRD、报告等输出文件存放位置
          </span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3">
        <Button
          variant="primary"
          size="default"
          onClick={handleSaveDir}
          disabled={savingDir || !projectsDirDirty}
          className="gap-2"
        >
          {savingDir && <Loader2 className="size-4 animate-spin" />}
          保存目录
        </Button>
        {dirSaveResult && (
          <div className="flex items-center gap-2 text-sm">
            {dirSaveResult.ok ? (
              <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" />
            ) : (
              <XCircle className="size-4 shrink-0 text-[var(--destructive)]" />
            )}
            <span className={dirSaveResult.ok ? "text-[var(--success)]" : "text-[var(--destructive)]"}>
              {dirSaveResult.message}
            </span>
          </div>
        )}
      </CardFooter>
    </Card>

    {/* Context Memory Toggle */}
    <Card className="hover:shadow-none mt-6">
      <CardHeader>
        <CardTitle>上下文记忆</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">自动注入知识库上下文</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              生成 PRD 等内容时，自动注入知识库中与当前需求相关的经验条目
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={contextMemoryEnabled}
              onChange={(e) => {
                const val = e.target.checked
                setContextMemoryEnabled(val)
                localStorage.setItem("context-memory-enabled", val ? "1" : "0")
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-[var(--border)] peer-focus:ring-2 peer-focus:ring-[var(--accent-ring)] rounded-full peer peer-checked:bg-[var(--accent-color)] transition-colors after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:size-4 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
      </CardContent>
    </Card>
    </>
  )
}
