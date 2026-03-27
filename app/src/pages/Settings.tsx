import { useSearchParams } from "react-router-dom"
import { ChevronLeft } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { SettingsApi } from "./settings/SettingsApi"
import { SettingsProject } from "./settings/SettingsProject"
import { SettingsAbout } from "./settings/SettingsAbout"
import { DiagnosticsPanel } from "@/components/diagnostics-panel"

type TabKey = "api" | "project" | "diagnostics" | "about"

const TABS: { key: TabKey; label: string }[] = [
  { key: "api", label: "API 配置" },
  { key: "project", label: "项目管理" },
  { key: "diagnostics", label: "环境诊断" },
  { key: "about", label: "关于" },
]

export function SettingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get("tab") as TabKey) || "api"

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

      {/* Tab bar */}
      <div className="flex gap-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSearchParams({ tab: key })}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              activeTab === key
                ? "bg-[var(--accent-color)] text-white font-medium"
                : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "api" && <SettingsApi />}
      {activeTab === "project" && <SettingsProject />}
      {activeTab === "diagnostics" && <DiagnosticsPanel />}
      {activeTab === "about" && <SettingsAbout />}
    </div>
  )
}
