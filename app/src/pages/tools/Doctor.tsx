import { DiagnosticsPanel } from "@/components/diagnostics-panel"

export function ToolDoctorPage() {
  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-[var(--text-primary)]">诊断中心</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            检查客户端运行、AI 上下文和本地依赖状态。
          </p>
        </div>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <DiagnosticsPanel />
    </div>
  )
}
