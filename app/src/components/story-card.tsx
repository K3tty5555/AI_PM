import { useState, useCallback } from "react"
import { RarityStripeCard } from "@/components/rarity-stripe-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Story } from "@/lib/story-parser"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoryCardProps {
  story: Story
  isExpanded: boolean
  onToggle: () => void
  onEdit: (story: Story) => void
  onDelete: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: any
}

// ---------------------------------------------------------------------------
// Priority → rarity mapping
// ---------------------------------------------------------------------------

const PRIORITY_RARITY: Record<string, "gold" | "teal" | "gray"> = {
  P0: "gold",
  P1: "teal",
  P2: "gray",
}

const PRIORITY_LABEL: Record<string, string> = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Drag handle icon — three horizontal lines */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DragHandle(props: any) {
  return (
    <div
      {...props}
      className={cn(
        "flex flex-col items-center justify-center gap-[3px]",
        "w-5 h-8 cursor-grab active:cursor-grabbing",
        "opacity-40 hover:opacity-80 transition-opacity duration-150",
        "shrink-0",
      )}
      aria-label="拖拽排序"
    >
      <span className="block w-3 h-[2px] bg-[var(--text-muted)]" />
      <span className="block w-3 h-[2px] bg-[var(--text-muted)]" />
      <span className="block w-3 h-[2px] bg-[var(--text-muted)]" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline editing for acceptance criteria
// ---------------------------------------------------------------------------

function AcceptanceList({
  items,
  onChange,
}: {
  items: string[]
  onChange: (items: string[]) => void
}) {
  const [newItem, setNewItem] = useState("")

  const handleItemChange = useCallback(
    (index: number, value: string) => {
      const updated = [...items]
      updated[index] = value
      onChange(updated)
    },
    [items, onChange]
  )

  const handleRemoveItem = useCallback(
    (index: number) => {
      const updated = items.filter((_, i) => i !== index)
      onChange(updated)
    },
    [items, onChange]
  )

  const handleAddItem = useCallback(() => {
    if (newItem.trim()) {
      onChange([...items, newItem.trim()])
      setNewItem("")
    }
  }, [items, newItem, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleAddItem()
      }
    },
    [handleAddItem]
  )

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[12px] font-medium text-[var(--text-secondary)]">
        验收标准
      </p>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2 group/item">
            <span className="mt-1 w-3 h-3 shrink-0 border border-[var(--border)] bg-transparent" />
            <input
              type="text"
              value={item}
              onChange={(e) => handleItemChange(index, e.target.value)}
              className={cn(
                "flex-1 text-sm text-[var(--dark)] bg-transparent",
                "border-b border-transparent",
                "focus:border-[var(--yellow)] outline-none",
                "transition-[border-color] duration-150",
              )}
            />
            <button
              type="button"
              onClick={() => handleRemoveItem(index)}
              className={cn(
                "text-xs text-[var(--text-muted)] opacity-0 group-hover/item:opacity-100",
                "hover:text-[var(--destructive)] transition-all duration-150",
                "cursor-pointer",
              )}
              aria-label="删除验收标准"
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
      {/* Add new item */}
      <div className="flex items-center gap-2 pt-1">
        <span className="mt-0 w-3 h-3 shrink-0 border border-dashed border-[var(--border)]" />
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="添加验收标准..."
          className={cn(
            "flex-1 text-sm text-[var(--dark)] bg-transparent",
            "border-b border-transparent",
            "placeholder:text-[var(--text-muted)]",
            "focus:border-[var(--yellow)] outline-none",
            "transition-[border-color] duration-150",
          )}
        />
        <Button
          variant="ghost"
          size="xs"
          onClick={handleAddItem}
          disabled={!newItem.trim()}
        >
          +
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StoryCard
// ---------------------------------------------------------------------------

function StoryCard({
  story,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  dragHandleProps,
}: StoryCardProps) {
  const rarity = PRIORITY_RARITY[story.priority] ?? "gray"

  const handleAcceptanceChange = useCallback(
    (acceptance: string[]) => {
      onEdit({ ...story, acceptance })
    },
    [story, onEdit]
  )

  return (
    <RarityStripeCard
      rarity={rarity}
      className={cn(
        "group/card",
        "animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        {dragHandleProps ? (
          <DragHandle {...dragHandleProps} />
        ) : (
          <div className="w-5 shrink-0" />
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={onToggle}
              className="flex-1 text-left cursor-pointer group/title"
            >
              <p className="text-sm text-[var(--dark)] leading-relaxed">
                <span className="font-medium">作为</span>
                <span className="text-[var(--dark)] font-semibold">{story.role}</span>
                <span className="font-medium">，我想要</span>
                <span className="text-[var(--dark)] font-semibold">{story.want}</span>
                <span className="font-medium">，以便</span>
                <span className="text-[var(--dark)] font-semibold">{story.benefit}</span>
              </p>
            </button>

            {/* Right side: badge + delete */}
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={story.priority === "P0" ? "default" : "outline"}>
                {PRIORITY_LABEL[story.priority]}
              </Badge>
              <button
                type="button"
                onClick={onDelete}
                className={cn(
                  "text-xs text-[var(--text-muted)]",
                  "opacity-0 group-hover/card:opacity-100",
                  "hover:text-[var(--destructive)]",
                  "transition-all duration-150",
                  "cursor-pointer",
                )}
                aria-label="删除故事"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Collapsed summary */}
          {!isExpanded && story.acceptance.length > 0 && (
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "mt-1 text-xs text-[var(--text-muted)]",
                "hover:text-[var(--dark)] transition-colors duration-150",
                "cursor-pointer",
              )}
            >
              验收标准({story.acceptance.length}) &#x25B8;
            </button>
          )}

          {/* Expanded: acceptance criteria */}
          {isExpanded && (
            <AcceptanceList
              items={story.acceptance}
              onChange={handleAcceptanceChange}
            />
          )}
        </div>
      </div>
    </RarityStripeCard>
  )
}

export { StoryCard }
