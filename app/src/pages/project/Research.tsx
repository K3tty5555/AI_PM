import { Badge } from "@/components/ui/badge"

export function ResearchPage() {
  return (
    <div className="mx-auto max-w-[720px]">
      <div className="mb-6"><Badge variant="outline">RESEARCH</Badge></div>
      <div className="h-px bg-[var(--border)]" />
      <p className="mt-8 text-sm text-[var(--text-muted)]">竞品研究功能即将推出</p>
    </div>
  )
}
