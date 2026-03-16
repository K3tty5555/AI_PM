import { Badge } from "@/components/ui/badge"

export function PrototypePage() {
  return (
    <div className="mx-auto max-w-[720px]">
      <div className="mb-6"><Badge variant="outline">PROTOTYPE</Badge></div>
      <div className="h-px bg-[var(--border)]" />
      <p className="mt-8 text-sm text-[var(--text-muted)]">原型设计功能即将推出</p>
    </div>
  )
}
