import { useEffect, useState, useCallback, useRef } from "react"
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { api, type IllustrationConfigState } from "@/lib/tauri-api"
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

export function SettingsApi() {
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

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  // Illustration config state
  const [illConfig, setIllConfig] = useState<IllustrationConfigState | null>(null)
  const [illProvider, setIllProvider] = useState("")
  const [illModel, setIllModel] = useState("")
  const [illApiKey, setIllApiKey] = useState("")
  const [illSize, setIllSize] = useState("")
  const [illTesting, setIllTesting] = useState(false)
  const [illTestResult, setIllTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [illSaving, setIllSaving] = useState(false)
  const [illSaved, setIllSaved] = useState(false)
  const [illShowKey, setIllShowKey] = useState(false)
  const illSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchConfig = useCallback(async () => {
    try {
      const data = await api.getConfig()
      setConfig(data as ConfigState)
      setModel(data.model)
      setBackend((data.backend as "api" | "claude_cli") || "api")
      if (data.baseUrl) setBaseUrl(data.baseUrl)
    } catch (err) {
      console.error("Failed to fetch config:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  // Fetch illustration config
  useEffect(() => {
    ;(async () => {
      try {
        const data = await api.getIllustrationConfig()
        setIllConfig(data)
        setIllProvider(data.provider)
        setIllModel(data.model)
        setIllSize(data.defaultSize)
      } catch (err) {
        console.error("Failed to fetch illustration config:", err)
      }
    })()
  }, [])

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

  // ── Illustration helpers ──

  const currentIllProvider = illConfig?.availableProviders.find((p) => p.id === illProvider)

  const saveIllustrationDebounced = useCallback(
    (provider: string, model: string, key: string, size: string) => {
      if (illSaveTimer.current) clearTimeout(illSaveTimer.current)
      illSaveTimer.current = setTimeout(async () => {
        setIllSaving(true)
        setIllSaved(false)
        try {
          await api.saveIllustrationConfig({
            provider,
            model,
            ...(key ? { apiKey: key } : {}),
            defaultSize: size,
          })
          setIllSaved(true)
          setTimeout(() => setIllSaved(false), 2000)
        } catch (err) {
          console.error("Failed to save illustration config:", err)
        } finally {
          setIllSaving(false)
        }
      }, 500)
    },
    [],
  )

  const handleIllProviderChange = (newProvider: string) => {
    setIllProvider(newProvider)
    const providerDef = illConfig?.availableProviders.find((p) => p.id === newProvider)
    const firstModel = providerDef?.models[0]?.id ?? ""
    const firstSize = providerDef?.sizes[0] ?? ""
    setIllModel(firstModel)
    setIllSize(firstSize)
    saveIllustrationDebounced(newProvider, firstModel, illApiKey, firstSize)
  }

  const handleIllModelChange = (newModel: string) => {
    setIllModel(newModel)
    saveIllustrationDebounced(illProvider, newModel, illApiKey, illSize)
  }

  const handleIllSizeChange = (newSize: string) => {
    setIllSize(newSize)
    saveIllustrationDebounced(illProvider, illModel, illApiKey, newSize)
  }

  const handleIllApiKeyChange = (newKey: string) => {
    setIllApiKey(newKey)
    saveIllustrationDebounced(illProvider, illModel, newKey, illSize)
  }

  const handleIllTest = async () => {
    setIllTesting(true)
    setIllTestResult(null)
    try {
      const data = await api.testIllustrationKey(illApiKey || undefined)
      if (data.valid) {
        setIllTestResult({ ok: true, message: data.message || "连接成功" })
      } else {
        setIllTestResult({ ok: false, message: data.message || "连接失败" })
      }
    } catch (err) {
      setIllTestResult({
        ok: false,
        message: typeof err === "string" ? err : err instanceof Error ? err.message : "请求异常",
      })
    } finally {
      setIllTesting(false)
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="h-[400px] border border-[var(--border)] bg-[var(--secondary)]/50"
        style={{ animation: "fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1)" }}
      />
    )
  }

  return (
    <>
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
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                <span className="text-sm text-[var(--text-primary)]">
                  已自动检测到配置（来源：{SOURCE_LABELS[config.configSource] || config.configSource}）
                </span>
              </>
            ) : (
              <>
                <Info className="mt-0.5 size-4 shrink-0 text-[var(--accent-color)]" />
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
                          className="relative h-7 w-[116px] shrink-0 overflow-hidden text-xs"
                        >
                          <span className={`absolute inset-0 flex items-center justify-center gap-1.5 transition-opacity duration-150 ${cliChecking ? "opacity-0" : "opacity-100"}`}>
                            检测 claude 命令
                          </span>
                          <span className={`absolute inset-0 flex items-center justify-center gap-1.5 transition-opacity duration-150 ${cliChecking ? "opacity-100" : "opacity-0"}`}>
                            <Loader2 className="size-3 animate-spin" />
                            检测中...
                          </span>
                        </Button>
                        {cliStatus && (
                          <span className={`flex items-center gap-1 text-xs ${cliStatus.ok ? "text-[var(--success)]" : "text-[var(--destructive)]"}`}>
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

            {/* Mode capability summary */}
            <div className={`rounded-lg border px-3 py-2.5 text-xs ${
              backend === "claude_cli"
                ? "border-[var(--accent-color)]/30 bg-[var(--accent-light,#DBEAFE)]/20"
                : "border-[var(--border)] bg-[var(--secondary)]"
            }`}>
              {backend === "claude_cli" ? (
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-[var(--accent-color)]">全部功能可用</span>
                  <span className="text-[var(--text-secondary)]">PRD 生成 · 竞品研究 · 网页截图分析 · Word 导出 · 多 Agent 并行</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-[var(--text-primary)]">核心功能可用</span>
                    <span className="text-[var(--text-tertiary)]">·</span>
                    <span className="text-[var(--text-tertiary)]">以下功能在此模式下不可用</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-[var(--text-tertiary)]">
                    <span>╌ 网页截图深度分析（需 Claude Code CLI 模式）</span>
                    <span>╌ 竞品自动截图（需 Playwright MCP + CLI 模式）</span>
                  </div>
                </div>
              )}
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
                <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" />
              ) : (
                <XCircle className="size-4 shrink-0 text-[var(--destructive)]" />
              )}
              <span
                className={
                  testResult.ok
                    ? "text-[var(--success)]"
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
                <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" />
              ) : (
                <XCircle className="size-4 shrink-0 text-[var(--destructive)]" />
              )}
              <span
                className={
                  saveResult.ok
                    ? "text-[var(--success)]"
                    : "text-[var(--destructive)]"
                }
              >
                {saveResult.message}
              </span>
            </div>
          )}
        </CardFooter>
      </Card>

      {/* Illustration Config Card */}
      {illConfig && (
        <Card className="hover:shadow-none">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>AI 图片生成</CardTitle>
              {illSaving && (
                <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                  <Loader2 className="size-3 animate-spin" />
                </span>
              )}
              {illSaved && (
                <span
                  className="flex items-center gap-1 text-xs text-[var(--success)]"
                  style={{ animation: "fadeInUp 0.3s cubic-bezier(0.16,1,0.3,1)" }}
                >
                  <CheckCircle2 className="size-3" />
                  已保存
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <div className="flex flex-col gap-5">
              {/* Provider */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">服务商</label>
                <select
                  value={illProvider}
                  onChange={(e) => handleIllProviderChange(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors duration-200 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                >
                  {illConfig.availableProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">模型</label>
                <select
                  value={illModel}
                  onChange={(e) => handleIllModelChange(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors duration-200 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                >
                  {currentIllProvider?.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-[var(--text-primary)]">API Key</label>
                  {illConfig.apiKeySource === "env" || illConfig.apiKeySource === "env_file" ? (
                    <Badge variant="success">来源：.env</Badge>
                  ) : illConfig.apiKeySource === "config" ? (
                    <Badge variant="default">来源：应用配置</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      未配置
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={illShowKey ? "text" : "password"}
                    value={illApiKey}
                    onChange={(e) => handleIllApiKeyChange(e.target.value)}
                    readOnly={illConfig.apiKeySource === "env" || illConfig.apiKeySource === "env_file"}
                    placeholder={illConfig.apiKeyMasked || "输入 API Key"}
                    className={`h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 pr-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors duration-200 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)] ${
                      illConfig.apiKeySource === "env" || illConfig.apiKeySource === "env_file"
                        ? "cursor-not-allowed opacity-60"
                        : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setIllShowKey(!illShowKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                    aria-label={illShowKey ? "隐藏密钥" : "显示密钥"}
                  >
                    {illShowKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {(illConfig.apiKeySource === "env" || illConfig.apiKeySource === "env_file") && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    如需更改请编辑 ~/.baoyu-skills/.env
                  </span>
                )}
              </div>

              {/* Default Size */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[var(--text-primary)]">默认尺寸</label>
                <select
                  value={illSize}
                  onChange={(e) => handleIllSizeChange(e.target.value)}
                  className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors duration-200 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-ring)]"
                >
                  {currentIllProvider?.sizes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex-col items-stretch gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="default"
                onClick={handleIllTest}
                disabled={illTesting}
                className="gap-2"
              >
                {illTesting && <Loader2 className="size-4 animate-spin" />}
                测试连接
              </Button>
            </div>

            {illTestResult && (
              <div
                className="flex items-center gap-2 text-sm"
                style={{ animation: "fadeInUp 0.3s cubic-bezier(0.16,1,0.3,1)" }}
              >
                {illTestResult.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-[var(--destructive)]" />
                )}
                <span
                  className={
                    illTestResult.ok ? "text-[var(--success)]" : "text-[var(--destructive)]"
                  }
                >
                  {illTestResult.message}
                </span>
              </div>
            )}
          </CardFooter>
        </Card>
      )}

      {/* Runtime Environment Card */}
      <Card className="hover:shadow-none">
        <CardHeader>
          <CardTitle>运行环境</CardTitle>
        </CardHeader>
        <CardContent>
          <EnvChecker backend={backend} />
        </CardContent>
      </Card>
    </>
  )
}
