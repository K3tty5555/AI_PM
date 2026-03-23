import { useEffect } from "react"

interface RevealContainerProps {
  isRevealing: boolean
  revealedCount: number
  totalCount: number
  onSkip: () => void
  children: React.ReactNode
}

export function RevealContainer({ isRevealing, revealedCount, totalCount, onSkip, children }: RevealContainerProps) {
  useEffect(() => {
    if (!isRevealing) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isRevealing, onSkip])

  return (
    <div className="relative" onClick={isRevealing ? onSkip : undefined}>
      {children}
      {isRevealing && (
        <div className="sticky bottom-4 flex justify-center pointer-events-none mt-4">
          <button
            className="pointer-events-auto px-3 py-1.5 text-[11px] text-[var(--text-tertiary)] bg-[var(--card)] border border-[var(--border)] rounded-full shadow-sm hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onSkip() }}
          >
            点击或按 Esc 显示全部（{revealedCount}/{totalCount}）
          </button>
        </div>
      )}
    </div>
  )
}
