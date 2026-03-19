import { useRef, useState, useCallback, useEffect } from "react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu"
import type { Tab } from "@/hooks/use-tabs"

// ─── Types ─────────────────────────────────────────────────────────────────

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseRight: (id: string) => void
  onReorder: (from: number, to: number) => void
}

// ─── Component ─────────────────────────────────────────────────────────────

export function TabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseRight,
  onReorder,
}: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragSourceIndex = useRef<number | null>(null)

  // Check if overflow arrows are needed
  const checkOverflow = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
  }, [])

  useEffect(() => {
    checkOverflow()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener("scroll", checkOverflow, { passive: true })
    const ro = new ResizeObserver(checkOverflow)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", checkOverflow)
      ro.disconnect()
    }
  }, [checkOverflow, tabs.length])

  const scrollBy = useCallback((delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" })
  }, [])

  // ─── Drag handlers ────────────────────────────────────────────────

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    dragSourceIndex.current = index
    e.dataTransfer.effectAllowed = "move"
    // Required for Firefox
    e.dataTransfer.setData("text/plain", String(index))
  }, [])

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((toIndex: number, e: React.DragEvent) => {
    e.preventDefault()
    const fromIndex = dragSourceIndex.current
    if (fromIndex !== null && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex)
    }
    dragSourceIndex.current = null
    setDragOverIndex(null)
  }, [onReorder])

  const handleDragEnd = useCallback(() => {
    dragSourceIndex.current = null
    setDragOverIndex(null)
  }, [])

  // ─── Render ───────────────────────────────────────────────────────

  // Don't render tab bar if only dashboard tab exists
  if (tabs.length <= 1) return null

  return (
    <div
      className="sticky top-0 z-10 -mx-8 flex items-center border-b border-[var(--border)] bg-[var(--background)] px-2"
      style={{ height: 36, minHeight: 36 }}
    >
      {/* Left scroll arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scrollBy(-160)}
          className="flex h-full w-6 shrink-0 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          aria-label="向左滚动"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.75} />
        </button>
      )}

      {/* Scrollable tab strip */}
      <div
        ref={scrollRef}
        className="flex flex-1 items-stretch overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={index}
            isActive={tab.id === activeTabId}
            isDragOver={dragOverIndex === index}
            onActivate={onActivate}
            onClose={onClose}
            onCloseOthers={onCloseOthers}
            onCloseRight={onCloseRight}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {/* Right scroll arrow */}
      {canScrollRight && (
        <button
          onClick={() => scrollBy(160)}
          className="flex h-full w-6 shrink-0 items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
          aria-label="向右滚动"
        >
          <ChevronRight className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}

// ─── Single Tab ────────────────────────────────────────────────────────────

interface TabItemProps {
  tab: Tab
  index: number
  isActive: boolean
  isDragOver: boolean
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseRight: (id: string) => void
  onDragStart: (index: number, e: React.DragEvent) => void
  onDragOver: (index: number, e: React.DragEvent) => void
  onDrop: (index: number, e: React.DragEvent) => void
  onDragEnd: () => void
}

function TabItem({
  tab,
  index,
  isActive,
  isDragOver,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseRight,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TabItemProps) {
  const [hovered, setHovered] = useState(false)

  const contextMenuItems: ContextMenuItem[] = [
    {
      label: "关闭",
      action: () => onClose(tab.id),
      hidden: !tab.closable,
    },
    {
      label: "关闭其他标签页",
      action: () => onCloseOthers(tab.id),
      separator: false,
    },
    {
      label: "关闭右侧标签页",
      action: () => onCloseRight(tab.id),
    },
  ]

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click to close
    if (e.button === 1 && tab.closable) {
      e.preventDefault()
      onClose(tab.id)
    }
  }

  return (
    <ContextMenu items={contextMenuItems}>
      <div
        role="tab"
        aria-selected={isActive}
        draggable
        className={[
          "group relative flex h-[36px] max-w-[180px] shrink-0 cursor-default select-none items-center gap-1 px-3",
          "text-[13px] leading-none transition-colors duration-100",
          isActive
            ? "bg-[var(--card)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]",
          isDragOver ? "ring-1 ring-inset ring-[var(--accent-color)]" : "",
        ].join(" ")}
        onClick={() => onActivate(tab.id)}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragStart={(e) => onDragStart(index, e)}
        onDragOver={(e) => onDragOver(index, e)}
        onDrop={(e) => onDrop(index, e)}
        onDragEnd={onDragEnd}
      >
        {/* Label */}
        <span className="truncate">{tab.label}</span>

        {/* Close button */}
        {tab.closable && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
            className={[
              "ml-1 flex size-4 shrink-0 items-center justify-center rounded-sm transition-all duration-100",
              hovered || isActive
                ? "opacity-60 hover:opacity-100 hover:bg-[var(--hover-bg)]"
                : "opacity-0",
            ].join(" ")}
            aria-label={`关闭 ${tab.label}`}
          >
            <X className="size-3" strokeWidth={1.75} />
          </button>
        )}

        {/* Active indicator */}
        {isActive && (
          <span
            className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-color)]"
          />
        )}
      </div>
    </ContextMenu>
  )
}
