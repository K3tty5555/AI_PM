import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Info, ChevronLeft, FolderOpen } from "lucide-react"
import { open as dialogOpen } from "@tauri-apps/plugin-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { api } from "@/lib/tauri-api"
import type { LegacyProjectScan } from "@/lib/tauri-api"

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

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

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
        setTimeout(() => navigate("/"), 1500)
      }
    } catch (err) {
      setImportResult({ imported: 0, skipped: 0 })
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

      {/* About Card */}
      <Card className="hover:shadow-none">
        <CardHeader>
          <CardTitle>关于</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-[var(--text-primary)]">
              AI PM Desktop v0.1.0
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              基于 Claude API 的产品经理工作台
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
