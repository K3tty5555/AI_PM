import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Info, ChevronLeft, FolderOpen, ExternalLink } from "lucide-react"
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"
import { open as openUrl } from "@tauri-apps/plugin-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { api, checkUpdate, downloadAndInstallUpdate } from "@/lib/tauri-api"
import type { LegacyProjectScan, KnowledgeCategoryScan, PrdStyleScan, UiSpecScan, MigrateResult, UpdateInfo } from "@/lib/tauri-api"
import { EnvChecker } from "@/components/env-checker"

interface ConfigState {
  hasConfig: boolean
  configSource: "env" | "shell" | "local" | "none"
  apiKey: string | null
  baseUrl: string | null
  model: string
}


const SOURCE_LABELS: Record<string, string> = {
  env: "环境变量",
  shell: "Shell Profile",
  local: "本地配置文件",
  none: "未检测到",
}

export function SettingsPage() {
  const navigate = useNavigate()

  // Remote config state
  const [config, setConfig] = useState<ConfigState | null>(null)
  const [loading, setLoading] = useState(true)

  // Form state
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("claude-sonnet-4-6")
  const [showKey, setShowKey] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [backend, setBackend] = useState<"api" | "claude_cli">("api")
  const [cliChecking, setCliChecking] = useState(false)
  const [cliStatus, setCliStatus] = useState<{ ok: boolean; message: string } | null>(null)

  // Test state
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  // Projects dir state
  const [projectsDir, setProjectsDir] = useState("")
  const [projectsDirDirty, setProjectsDirDirty] = useState(false)
  const [savingDir, setSavingDir] = useState(false)
  const [dirSaveResult, setDirSaveResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Migration state
  const [scanning, setScanning] = useState(false)
  const [scanResults, setScanResults] = useState<LegacyProjectScan[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)

  // Template migration state
  const [kbScanning, setKbScanning] = useState(false)
  const [kbScanResults, setKbScanResults] = useState<KnowledgeCategoryScan[] | null>(null)
  const [kbImporting, setKbImporting] = useState(false)
  const [kbImportResult, setKbImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [kbImportDir, setKbImportDir] = useState<string | null>(null)

  const [prdStyleScanning, setPrdStyleScanning] = useState(false)
  const [prdStyleScanResults, setPrdStyleScanResults] = useState<PrdStyleScan[] | null>(null)
  const [prdStyleImporting, setPrdStyleImporting] = useState(false)
  const [prdStyleImportResult, setPrdStyleImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [prdStyleImportDir, setPrdStyleImportDir] = useState<string | null>(null)

  const [uiSpecScanning, setUiSpecScanning] = useState(false)
  const [uiSpecScanResults, setUiSpecScanResults] = useState<UiSpecScan[] | null>(null)
  const [uiSpecImporting, setUiSpecImporting] = useState(false)
  const [uiSpecImportResult, setUiSpecImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [uiSpecImportDir, setUiSpecImportDir] = useState<string | null>(null)

  // File consolidation state
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  // Manual update check state
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [manualUpdateInfo, setManualUpdateInfo] = useState<UpdateInfo | null>(null)
  const [manualUpdateState, setManualUpdateState] = useState<
    "idle" | "available" | "downloading" | "ready" | "none" | "error"
  >("idle")

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setManualUpdateState("idle")
    setManualUpdateInfo(null)
    try {
      const info = await checkUpdate()
      if (info.available) {
        setManualUpdateInfo(info)
        setManualUpdateState("available")
      } else {
        setManualUpdateState("none")
      }
    } catch (err) {
      console.error("[Settings] check update failed", err)
      setManualUpdateState("error")
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleManualDownload = async () => {
    setManualUpdateState("downloading")
    try {
      await downloadAndInstallUpdate()
      setManualUpdateState("ready")
    } catch (err) {
      console.error("[Settings] download update failed", err)
      setManualUpdateState("error")
    }
  }

  const fetchConfig = useCallback(async () => {
    try {
      const [data, dir] = await Promise.all([
        api.getConfig(),
        api.getProjectsDir(),
      ])
      setConfig(data as ConfigState)
      setModel(data.model)
      setBackend((data.backend as "api" | "claude_cli") || "api")
      if (data.baseUrl) setBaseUrl(data.baseUrl)
      setProjectsDir(dir)
    } catch (err) {
      console.error("Failed to fetch config:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const handleScanKnowledge = async () => {
    const selected = await dialogOpen({ directory: true, multiple: false })
    if (!selected || typeof selected !== "string") return
    setKbScanning(true)
    setKbScanResults(null)
    setKbImportResult(null)
    setKbImportDir(selected)
    try {
      const results = await api.scanLegacyKnowledge(selected)
      setKbScanResults(results)
    } catch {
      setKbScanResults([])
    } finally {
      setKbScanning(false)
    }
  }

  const handleImportKnowledge = async () => {
    if (!kbImportDir) return
    setKbImporting(true)
    try {
      const result = await api.importLegacyKnowledge(kbImportDir)
      setKbImportResult(result)
      setKbScanResults(null)
      setKbImportDir(null)
    } catch {
      setKbImportResult({ imported: 0, skipped: 0 })
      setKbScanResults(null)
      setKbImportDir(null)
    } finally {
      setKbImporting(false)
    }
  }

  const handleScanPrdStyles = async () => {
    const selected = await dialogOpen({ directory: true, multiple: false })
    if (!selected || typeof selected !== "string") return
    setPrdStyleScanning(true)
    setPrdStyleScanResults(null)
    setPrdStyleImportResult(null)
    setPrdStyleImportDir(selected)
    try {
      const results = await api.scanLegacyPrdStyles(selected)
      setPrdStyleScanResults(results)
    } catch {
      setPrdStyleScanResults([])
    } finally {
      setPrdStyleScanning(false)
    }
  }

  const handleImportPrdStyles = async () => {
    if (!prdStyleImportDir) return
    setPrdStyleImporting(true)
    try {
      const result = await api.importLegacyPrdStyles(prdStyleImportDir)
      setPrdStyleImportResult(result)
      setPrdStyleScanResults(null)
      setPrdStyleImportDir(null)
    } catch {
      setPrdStyleImportResult({ imported: 0, skipped: 0 })
      setPrdStyleScanResults(null)
      setPrdStyleImportDir(null)
    } finally {
      setPrdStyleImporting(false)
    }
  }

  const handleScanUiSpecs = async () => {
    const selected = await dialogOpen({ directory: true, multiple: false })
    if (!selected || typeof selected !== "string") return
    setUiSpecScanning(true)
    setUiSpecScanResults(null)
    setUiSpecImportResult(null)
    setUiSpecImportDir(selected)
    try {
      const results = await api.scanLegacyUiSpecs(selected)
      setUiSpecScanResults(results)
    } catch {
      setUiSpecScanResults([])
    } finally {
      setUiSpecScanning(false)
    }
  }

  const handleImportUiSpecs = async () => {
    if (!uiSpecImportDir) return
    setUiSpecImporting(true)
    try {
      const result = await api.importLegacyUiSpecs(uiSpecImportDir)
      setUiSpecImportResult(result)
      setUiSpecScanResults(null)
      setUiSpecImportDir(null)
    } catch {
      setUiSpecImportResult({ imported: 0, skipped: 0 })
      setUiSpecScanResults(null)
      setUiSpecImportDir(null)
    } finally {
      setUiSpecImporting(false)
    }
  }

  const handleScanLegacy = async () => {
    const selected = await dialogOpen({ directory: true, multiple: false })
    if (!selected || typeof selected !== "string") return
    setScanning(true)
    setScanResults(null)
    setImportResult(null)
    try {
      const results = await api.scanLegacyProjects(selected)
      setScanResults(results)
    } catch (err) {
      setScanResults([])
    } finally {
      setScanning(false)
    }
  }

  const handleImportLegacy = async () => {
    if (!scanResults) return
    const toImport = scanResults.filter((p) => !p.alreadyExists)
    if (toImport.length === 0) return
    setImporting(true)
    try {
      const result = await api.importLegacyProjects(toImport)
      setImportResult(result)
      setScanResults(null)
      if (result.imported > 0) {
        window.dispatchEvent(new CustomEvent("projects-updated"))
        setTimeout(() => navigate("/"), 1500)
      }
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0 })
      setScanResults(null)
    } finally {
      setImporting(false)
    }
  }

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

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const data = await api.testConfig({
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
      })
      if (data.ok) {
        setTestResult({ ok: true, message: `连接成功 (${data.model})` })
      } else {
        setTestResult({ ok: false, message: `连接失败: ${data.error}` })
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: `请求异常: ${typeof err === "string" ? err : err instanceof Error ? err.message : "未知错误"}`,
      })
    } finally {
      setTesting(false)
    }
  }

  const handleTestCli = async () => {
    setCliChecking(true)
    setCliStatus(null)
    try {
      const data = await api.testCliConfig()
      if (data.ok) {
        setCliStatus({ ok: true, message: `已检测到：${data.version}` })
      } else {
        setCliStatus({ ok: false, message: data.error || "检测失败" })
      }
    } catch (err) {
      setCliStatus({
        ok: false,
        message: typeof err === "string" ? err : "检测失败",
      })
    } finally {
      setCliChecking(false)
    }
  }

  const handleMigrateToAppDir = async () => {
    setMigrating(true)
    setMigrateResult(null)
    try {
      const result = await api.migrateProjectsToAppDir()
      setMigrateResult(result)
    } catch (err) {
      setMigrateResult({ migrated: 0, skipped: 0, failed: [{ name: "迁移失败", error: typeof err === "string" ? err : "未知错误" }] })
    } finally {
      setMigrating(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveResult(null)
    try {
      await api.saveConfig({
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(model ? { model } : {}),
        backend,
      })
      setSaveResult({ ok: true, message: "配置已保存" })
      setDirty(false)
      // Refresh config display
      await fetchConfig()
      // Clear the raw apiKey input after successful save
      setApiKey("")
      setShowKey(false)
    } catch (err) {
      setSaveResult({
        ok: false,
        message: typeof err === "string" ? err : "保存失败",
      })
    } finally {
      setSaving(false)
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-5 w-32 bg-[var(--secondary)]" />
        <div className="h-px bg-[var(--border)]" />
        <div
          className="h-[400px] border border-[var(--border)] bg-[var(--secondary)]/50"
          style={{ animation: "fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-6"
      style={{ animation: "fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1)" }}
    >
      {/* Page header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <ChevronLeft className="size-3.5" />
          返回
        </button>
        <h1 className="text-base font-semibold text-[var(--text-primary)]">设置</h1>
      </div>
      <div className="h-px bg-[var(--border)]" />

      {/* API Config Card */}
      <Card className="hover:shadow-none">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>API 配置</CardTitle>
            <Badge variant={config?.hasConfig || backend === "claude_cli" ? "default" : "outline"}>
              {backend === "claude_cli" ? "CLI" : config?.hasConfig ? "已连接" : "未配置"}
            </Badge>
          </div>

          {/* Status message */}
          <div className="mt-3 flex items-start gap-2">
            {config?.hasConfig ? (
              <>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--green)]" />
                <span className="text-sm text-[var(--text-primary)]">
                  已自动检测到配置（来源：{SOURCE_LABELS[config.configSource] || config.configSource}）
                </span>
              </>
            ) : (
              <>
                <Info className="mt-0.5 size-4 shrink-0 text-[var(--yellow)]" />
                <span className="text-sm text-[var(--text-primary)]">
                  未检测到配置，请手动填写
                </span>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-5">
            {/* Backend Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">AI 后端</label>
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="backend"
                    value="api"
                    checked={backend === "api"}
                    onChange={() => { setBackend("api"); setDirty(true); setCliStatus(null) }}
                    className="mt-0.5 accent-[var(--accent-color)]"
                  />
                  <div>
                    <span className="text-sm text-[var(--text-primary)]">API Key 模式</span>
                    <p className="text-xs text-[var(--text-secondary)]">自行配置 API Key，支持 Anthropic 及 OpenAI 兼容接口</p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name="backend"
                    value="claude_cli"
                    checked={backend === "claude_cli"}
                    onChange={() => { setBackend("claude_cli"); setDirty(true); setCliStatus(null) }}
                    className="mt-0.5 accent-[var(--accent-color)]"
                  />
                  <div className="flex-1">
                    <span className="text-sm text-[var(--text-primary)]">Claude Code CLI</span>
                    <p className="text-xs text-[var(--text-secondary)]">复用本机已登录的 Claude Code，无需单独配置 Key</p>
                    {backend === "claude_cli" && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleTestCli}
                          disabled={cliChecking}
                          className="h-7 gap-1.5 px-2 text-xs"
                        >
                          {cliChecking && <Loader2 className="size-3 animate-spin" />}
                          检测 claude 命令
                        </Button>
                        {cliStatus && (
                          <span className={`flex items-center gap-1 text-xs ${cliStatus.ok ? "text-[var(--green)]" : "text-[var(--destructive)]"}`}>
                            {cliStatus.ok
                              ? <CheckCircle2 className="size-3" />
                              : <XCircle className="size-3" />
                            }
                            {cliStatus.message}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {backend === "api" && (
              <>
                {/* API Key */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">
                    认证密钥
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value)
                        setDirty(true)
                      }}
                      placeholder={config?.apiKey || "输入 API Key"}
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 pr-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors duration-200 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                      aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                    >
                      {showKey ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">
                    不限格式，支持 API Key、代理凭证等
                  </span>
                </div>

                {/* Base URL */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">
                    API 地址（可选）
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => {
                      setBaseUrl(e.target.value)
                      setDirty(true)
                    }}
                    placeholder="https://api.anthropic.com"
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors duration-200 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                  <span className="text-xs text-[var(--text-secondary)]">
                    留空则使用官方地址，代理用户填写代理地址
                  </span>
                </div>

                {/* Model */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[var(--text-primary)]">
                    模型
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value)
                      setDirty(true)
                    }}
                    placeholder="claude-sonnet-4-6"
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors duration-200 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex-col items-stretch gap-4">
          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="default"
              onClick={backend === "claude_cli" ? handleTestCli : handleTest}
              disabled={testing || cliChecking}
              className="gap-2"
            >
              {testing && <Loader2 className="size-4 animate-spin" />}
              测试连接
            </Button>
            <Button
              variant="primary"
              size="default"
              onClick={handleSave}
              disabled={saving || (!dirty && !apiKey)}
              className="gap-2"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              保存配置
            </Button>
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ animation: "fadeInUp 0.3s cubic-bezier(0.16,1,0.3,1)" }}
            >
              {testResult.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-[var(--green)]" />
              ) : (
                <XCircle className="size-4 shrink-0 text-[var(--destructive)]" />
              )}
              <span
                className={
                  testResult.ok
                    ? "text-[var(--green)]"
                    : "text-[var(--destructive)]"
                }
              >
                {testResult.message}
              </span>
            </div>
          )}

          {/* Save result */}
          {saveResult && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ animation: "fadeInUp 0.3s cubic-bezier(0.16,1,0.3,1)" }}
            >
              {saveResult.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-[var(--green)]" />
              ) : (
                <XCircle className="size-4 shrink-0 text-[var(--destructive)]" />
              )}
              <span
                className={
                  saveResult.ok
                    ? "text-[var(--green)]"
                    : "text-[var(--destructive)]"
                }
              >
                {saveResult.message}
              </span>
            </div>
          )}
        </CardFooter>
      </Card>

      {/* Runtime Environment Card */}
      <Card className="hover:shadow-none">
        <CardHeader>
          <CardTitle>运行环境</CardTitle>
        </CardHeader>
        <CardContent>
          <EnvChecker />
        </CardContent>
      </Card>

      {/* Data Directory Card */}
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
                <CheckCircle2 className="size-4 shrink-0 text-[var(--green)]" />
              ) : (
                <XCircle className="size-4 shrink-0 text-[var(--destructive)]" />
              )}
              <span className={dirSaveResult.ok ? "text-[var(--green)]" : "text-[var(--destructive)]"}>
                {dirSaveResult.message}
              </span>
            </div>
          )}
        </CardFooter>
      </Card>

        {/* 数据迁移 */}
        <Card>
          <CardHeader>
            <CardTitle>数据迁移</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              将旧版 AI PM（Claude Code skill 版）的历史项目导入到客户端。选择旧版的{" "}
              <code className="text-xs bg-[var(--hover-bg)] px-1 py-0.5 rounded">output/projects/</code>{" "}
              目录即可。
            </p>

            {!scanResults && !importResult && (
              <Button
                variant="ghost"
                onClick={handleScanLegacy}
                disabled={scanning}
                className="flex items-center gap-2"
              >
                <FolderOpen className="size-3.5" />
                {scanning ? "扫描中..." : "选择旧版项目目录"}
              </Button>
            )}

            {scanResults !== null && scanResults.length === 0 && (
              <p className="text-sm text-[var(--text-tertiary)]">未找到旧版项目，请确认目录正确。</p>
            )}

            {scanResults && scanResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-[var(--text-secondary)]">
                  发现 {scanResults.length} 个项目：
                </p>
                <ul className="space-y-1">
                  {scanResults.map((p) => (
                    <li key={p.dir} className="flex items-center gap-2 text-sm">
                      {p.alreadyExists ? (
                        <span className="text-[var(--text-tertiary)]">
                          — {p.name}{" "}
                          <span className="text-xs">（已存在，跳过）</span>
                        </span>
                      ) : (
                        <span className="text-[var(--text-primary)]">
                          ✓ {p.name}{" "}
                          <span className="text-xs text-[var(--text-tertiary)]">
                            （{p.completedPhases.length}/7 阶段已完成）
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="primary"
                    onClick={handleImportLegacy}
                    disabled={importing || scanResults.every((p) => p.alreadyExists)}
                  >
                    {importing
                      ? "导入中..."
                      : `确认导入 ${scanResults.filter((p) => !p.alreadyExists).length} 个项目`}
                  </Button>
                  <Button variant="ghost" onClick={() => setScanResults(null)}>
                    取消
                  </Button>
                </div>
              </div>
            )}

            {importResult && (
              importResult.imported > 0 ? (
                <p className="text-sm text-[var(--success)]">
                  ✓ 已导入 {importResult.imported} 个项目
                  {importResult.skipped > 0
                    ? `，跳过 ${importResult.skipped} 个（已存在）`
                    : ""}
                  ，正在跳转…
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--destructive)]">
                    导入失败，请重试。
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setImportResult(null)}>
                    重试
                  </Button>
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* 模板迁移 */}
        <Card>
          <CardHeader>
            <CardTitle>模板迁移</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* 知识库 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">知识库</p>
              <p className="text-xs text-[var(--text-secondary)]">
                从旧版 AI PM 的{" "}
                <code className="bg-[var(--hover-bg)] px-1 py-0.5 rounded">templates/knowledge-base/</code>{" "}
                目录导入已沉淀的经验条目。
              </p>

              {!kbScanResults && !kbImportResult && (
                <Button variant="ghost" onClick={handleScanKnowledge} disabled={kbScanning} className="flex items-center gap-2">
                  <FolderOpen className="size-3.5" />
                  {kbScanning ? "扫描中..." : "选择知识库目录"}
                </Button>
              )}

              {kbScanResults !== null && kbScanResults.length === 0 && (
                <p className="text-sm text-[var(--text-tertiary)]">未发现知识库条目，请确认目录正确。</p>
              )}

              {kbScanResults && kbScanResults.length > 0 && (
                <div className="space-y-2">
                  <ul className="space-y-0.5">
                    {kbScanResults.map((cat) => (
                      <li key={cat.category} className="text-sm">
                        <span className="text-[var(--text-secondary)]">{cat.category}</span>
                        <span className="ml-2 text-[var(--text-tertiary)] text-xs">
                          {cat.total} 条（{cat.newCount > 0 ? `${cat.newCount} 条新` : "已全部导入"}）
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      onClick={handleImportKnowledge}
                      disabled={kbImporting || kbScanResults.every((c) => c.newCount === 0)}
                    >
                      {kbImporting
                        ? "导入中..."
                        : `确认导入 ${kbScanResults.reduce((s, c) => s + c.newCount, 0)} 条`}
                    </Button>
                    <Button variant="ghost" onClick={() => { setKbScanResults(null); setKbImportDir(null) }}>
                      取消
                    </Button>
                  </div>
                </div>
              )}

              {kbImportResult && (
                kbImportResult.imported > 0 ? (
                  <p className="text-sm text-[var(--success)]">
                    ✓ 已导入 {kbImportResult.imported} 条
                    {kbImportResult.skipped > 0 ? `，跳过 ${kbImportResult.skipped} 条（已存在）` : ""}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-[var(--destructive)]">导入失败，请重试。</p>
                    <Button variant="ghost" size="sm" onClick={() => setKbImportResult(null)}>重试</Button>
                  </div>
                )
              )}
            </div>

            <div className="h-px bg-[var(--border)]" />

            {/* PRD 写作风格 & 分身 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">PRD 写作风格 & 产品分身</p>
              <p className="text-xs text-[var(--text-secondary)]">
                从旧版 AI PM 的{" "}
                <code className="bg-[var(--hover-bg)] px-1 py-0.5 rounded">templates/prd-styles/</code>{" "}
                目录导入 PRD 风格配置和分身档案。
              </p>

              {!prdStyleScanResults && !prdStyleImportResult && (
                <Button variant="ghost" onClick={handleScanPrdStyles} disabled={prdStyleScanning} className="flex items-center gap-2">
                  <FolderOpen className="size-3.5" />
                  {prdStyleScanning ? "扫描中..." : "选择 PRD 样式目录"}
                </Button>
              )}

              {prdStyleScanResults !== null && prdStyleScanResults.length === 0 && (
                <p className="text-sm text-[var(--text-tertiary)]">未发现样式配置，请确认目录正确。</p>
              )}

              {prdStyleScanResults && prdStyleScanResults.length > 0 && (
                <div className="space-y-2">
                  <ul className="space-y-0.5">
                    {prdStyleScanResults.map((spec) => (
                      <li key={spec.name} className="text-sm">
                        {spec.alreadyExists ? (
                          <span className="text-[var(--text-tertiary)]">
                            — {spec.name} <span className="text-xs">（已存在，跳过）</span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-primary)]">
                            ✓ {spec.name}
                            {spec.hasPersona && (
                              <span className="ml-1 text-xs text-[var(--text-tertiary)]">（含分身档案）</span>
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      onClick={handleImportPrdStyles}
                      disabled={prdStyleImporting || prdStyleScanResults.every((s) => s.alreadyExists)}
                    >
                      {prdStyleImporting
                        ? "导入中..."
                        : `确认导入 ${prdStyleScanResults.filter((s) => !s.alreadyExists).length} 个`}
                    </Button>
                    <Button variant="ghost" onClick={() => { setPrdStyleScanResults(null); setPrdStyleImportDir(null) }}>
                      取消
                    </Button>
                  </div>
                </div>
              )}

              {prdStyleImportResult && (
                prdStyleImportResult.imported > 0 ? (
                  <p className="text-sm text-[var(--success)]">
                    ✓ 已导入 {prdStyleImportResult.imported} 个
                    {prdStyleImportResult.skipped > 0 ? `，跳过 ${prdStyleImportResult.skipped} 个（已存在）` : ""}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-[var(--destructive)]">导入失败，请重试。</p>
                    <Button variant="ghost" size="sm" onClick={() => setPrdStyleImportResult(null)}>重试</Button>
                  </div>
                )
              )}
            </div>

            <div className="h-px bg-[var(--border)]" />

            {/* UI 视觉规范 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">UI 视觉规范</p>
              <p className="text-xs text-[var(--text-secondary)]">
                从旧版 AI PM 的{" "}
                <code className="bg-[var(--hover-bg)] px-1 py-0.5 rounded">templates/ui-specs/</code>{" "}
                目录导入 UI 设计规范（设计 Token、组件规范等）。
              </p>

              {!uiSpecScanResults && !uiSpecImportResult && (
                <Button variant="ghost" onClick={handleScanUiSpecs} disabled={uiSpecScanning} className="flex items-center gap-2">
                  <FolderOpen className="size-3.5" />
                  {uiSpecScanning ? "扫描中..." : "选择 UI 规范目录"}
                </Button>
              )}

              {uiSpecScanResults !== null && uiSpecScanResults.length === 0 && (
                <p className="text-sm text-[var(--text-tertiary)]">未发现 UI 规范，请确认目录正确。</p>
              )}

              {uiSpecScanResults && uiSpecScanResults.length > 0 && (
                <div className="space-y-2">
                  <ul className="space-y-0.5">
                    {uiSpecScanResults.map((spec) => (
                      <li key={spec.name} className="text-sm">
                        {spec.alreadyExists ? (
                          <span className="text-[var(--text-tertiary)]">
                            — {spec.name} <span className="text-xs">（已存在，跳过）</span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-primary)]">✓ {spec.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      onClick={handleImportUiSpecs}
                      disabled={uiSpecImporting || uiSpecScanResults.every((s) => s.alreadyExists)}
                    >
                      {uiSpecImporting
                        ? "导入中..."
                        : `确认导入 ${uiSpecScanResults.filter((s) => !s.alreadyExists).length} 个`}
                    </Button>
                    <Button variant="ghost" onClick={() => { setUiSpecScanResults(null); setUiSpecImportDir(null) }}>
                      取消
                    </Button>
                  </div>
                </div>
              )}

              {uiSpecImportResult && (
                uiSpecImportResult.imported > 0 ? (
                  <p className="text-sm text-[var(--success)]">
                    ✓ 已导入 {uiSpecImportResult.imported} 个
                    {uiSpecImportResult.skipped > 0 ? `，跳过 ${uiSpecImportResult.skipped} 个（已存在）` : ""}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-[var(--destructive)]">导入失败，请重试。</p>
                    <Button variant="ghost" size="sm" onClick={() => setUiSpecImportResult(null)}>重试</Button>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>

      {/* File Consolidation Card */}
      <Card className="hover:shadow-none">
        <CardHeader>
          <CardTitle>项目文件整理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            将所有不在应用目录中的历史项目文件复制到统一位置。原目录文件不会被删除。
          </p>

          {!migrateResult && (
            <Button
              variant="ghost"
              onClick={handleMigrateToAppDir}
              disabled={migrating}
              className="flex items-center gap-2"
            >
              {migrating && <Loader2 className="size-3.5 animate-spin" />}
              {migrating ? "迁移中..." : "迁移到应用目录"}
            </Button>
          )}

          {migrateResult && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--text-secondary)]">
                已迁移 {migrateResult.migrated} 个项目，跳过 {migrateResult.skipped} 个（原目录不存在）
              </p>
              {migrateResult.failed.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-[var(--destructive)]">迁移失败：</p>
                  <ul className="space-y-0.5">
                    {migrateResult.failed.map((f, i) => (
                      <li key={i} className="text-xs text-[var(--destructive)]">
                        {f.name}：{f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMigrateResult(null)}
                className="text-xs"
              >
                重置
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* About Card */}
      <Card className="hover:shadow-none">
        <CardHeader>
          <CardTitle>关于</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--text-primary)]">
              AI PM Desktop v0.1.0
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              基于 Claude API 的产品经理工作台
            </p>
            <button
              type="button"
              onClick={() => openUrl("https://github.com/K3tty5555/AI_PM")}
              className="flex w-fit items-center gap-1.5 text-sm text-[var(--accent-color)] hover:underline"
            >
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
              github.com/K3tty5555/AI_PM
            </button>

            {/* Manual update check */}
            <div className="mt-1 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate || manualUpdateState === "downloading"}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  {checkingUpdate ? "检查中…" : "检查更新"}
                </button>

                {manualUpdateState === "none" && (
                  <span className="text-sm text-[var(--text-secondary)]">
                    已是最新版本
                  </span>
                )}
                {manualUpdateState === "available" && (
                  <span className="text-sm text-[var(--text-primary)]">
                    发现新版本 v{manualUpdateInfo?.version}
                  </span>
                )}
                {manualUpdateState === "downloading" && (
                  <span className="text-sm text-[var(--text-secondary)]">
                    正在下载…
                  </span>
                )}
                {manualUpdateState === "ready" && (
                  <span className="text-sm text-[var(--accent-color)]">
                    ✅ 已下载，下次启动自动安装
                  </span>
                )}
                {manualUpdateState === "error" && (
                  <span className="text-sm text-red-500">检查失败，请重试</span>
                )}
              </div>

              {manualUpdateState === "available" && (
                <button
                  type="button"
                  onClick={handleManualDownload}
                  className="w-fit rounded-lg bg-[var(--accent-color)] px-3 py-1.5 text-sm text-white hover:opacity-90"
                >
                  下载并安装
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
