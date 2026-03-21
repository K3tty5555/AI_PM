import { useState, useCallback, useMemo } from "react"
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd"
import { StoryCard } from "@/components/story-card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Story } from "@/lib/story-parser"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoryBoardProps {
  stories: Story[]
  onStoriesChange: (stories: Story[]) => void
  isStreaming?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_GROUPS: {
  key: "P0" | "P1" | "P2"
  label: string
}[] = [
  { key: "P0", label: "P0 高优先级" },
  { key: "P1", label: "P1 中优先级" },
  { key: "P2", label: "P2 低优先级" },
]

// ---------------------------------------------------------------------------
// Inline add story form
// ---------------------------------------------------------------------------

function AddStoryForm({
  onAdd,
  onCancel,
}: {
  onAdd: (story: Omit<Story, "id">) => void
  onCancel: () => void
}) {
  const [role, setRole] = useState("")
  const [want, setWant] = useState("")
  const [benefit, setBenefit] = useState("")
  const [priority, setPriority] = useState<"P0" | "P1" | "P2">("P1")

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!role.trim() || !want.trim() || !benefit.trim()) return
      onAdd({
        role: role.trim(),
        want: want.trim(),
        benefit: benefit.trim(),
        priority,
        acceptance: [],
      })
    },
    [role, want, benefit, priority, onAdd]
  )

  const inputClass = cn(
    "w-full px-3 py-1.5 text-sm text-[var(--dark)]",
    "bg-transparent border border-[var(--border)]",
    "placeholder:text-[var(--text-muted)]",
    "outline-none",
    "transition-[border-color] duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
    "focus:border-[var(--accent-color)]",
  )

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "border border-[var(--border)] p-4 space-y-3",
        "bg-[var(--card)]",
        "animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]",
      )}
    >
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
        <label className="text-[12px] font-medium text-[var(--text-tertiary)]">
          角色
        </label>
        <input
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="教师"
          className={inputClass}
          autoFocus
        />

        <label className="text-[12px] font-medium text-[var(--text-tertiary)]">
          想要
        </label>
        <input
          type="text"
          value={want}
          onChange={(e) => setWant(e.target.value)}
          placeholder="查看班级考试报告"
          className={inputClass}
        />

        <label className="text-[12px] font-medium text-[var(--text-tertiary)]">
          以便
        </label>
        <input
          type="text"
          value={benefit}
          onChange={(e) => setBenefit(e.target.value)}
          placeholder="了解学生学情"
          className={inputClass}
        />

        <label className="text-[12px] font-medium text-[var(--text-tertiary)]">
          优先级
        </label>
        <div className="flex gap-2">
          {(["P0", "P1", "P2"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                "px-3 py-1 text-xs font-medium border cursor-pointer",
                "transition-all duration-150",
                priority === p
                  ? "border-[var(--accent-color)] bg-[var(--accent-color)] text-[var(--dark)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-color)]",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={!role.trim() || !want.trim() || !benefit.trim()}
        >
          添加
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Priority group (collapsible)
// ---------------------------------------------------------------------------

function PriorityGroup({
  groupKey,
  label,
  stories,
  expandedIds,
  onToggleExpand,
  onEditStory,
  onDeleteStory,
}: {
  groupKey: string
  label: string
  stories: Story[]
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onEditStory: (story: Story) => void
  onDeleteStory: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  if (stories.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Group header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "flex items-center gap-2 w-full text-left",
          "cursor-pointer group/header",
        )}
      >
        <span
          className={cn(
            "text-xs transition-transform duration-150",
            collapsed ? "rotate-0" : "rotate-90",
          )}
        >
          &#x25B6;
        </span>
        <h3 className="text-[12px] font-semibold text-[var(--text-secondary)]">
          {label}
        </h3>
        <span className="text-xs text-[var(--text-secondary)]">
          ({stories.length})
        </span>
      </button>

      {/* Story cards */}
      {!collapsed && (
        <Droppable droppableId={groupKey}>
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="space-y-3"
            >
              {stories.map((story, index) => (
                <Draggable
                  key={story.id}
                  draggableId={story.id}
                  index={index}
                >
                  {(dragProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                    >
                      <StoryCard
                        story={story}
                        isExpanded={expandedIds.has(story.id)}
                        onToggle={() => onToggleExpand(story.id)}
                        onEdit={onEditStory}
                        onDelete={() => onDeleteStory(story.id)}
                        dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StoryBoard
// ---------------------------------------------------------------------------

function StoryBoard({ stories, onStoriesChange, isStreaming }: StoryBoardProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)

  // Group stories by priority
  const grouped = useMemo(() => {
    const groups: Record<string, Story[]> = { P0: [], P1: [], P2: [] }
    for (const story of stories) {
      groups[story.priority]?.push(story)
    }
    return groups
  }, [stories])

  // Stats
  const stats = useMemo(() => {
    return {
      total: stories.length,
      p0: grouped.P0.length,
      p1: grouped.P1.length,
      p2: grouped.P2.length,
    }
  }, [stories.length, grouped])

  // Toggle expanded card
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Edit a story
  const handleEditStory = useCallback(
    (updated: Story) => {
      const next = stories.map((s) => (s.id === updated.id ? updated : s))
      onStoriesChange(next)
    },
    [stories, onStoriesChange]
  )

  // Delete a story
  const handleDeleteStory = useCallback(
    (id: string) => {
      const next = stories.filter((s) => s.id !== id)
      onStoriesChange(next)
    },
    [stories, onStoriesChange]
  )

  // Add a new story
  const handleAddStory = useCallback(
    (storyData: Omit<Story, "id">) => {
      const newStory: Story = {
        id: `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...storyData,
      }
      onStoriesChange([...stories, newStory])
      setShowAddForm(false)
    },
    [stories, onStoriesChange]
  )

  // Drag-and-drop handler
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination } = result
      if (!destination) return
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return
      }

      const sourcePriority = source.droppableId as "P0" | "P1" | "P2"
      const destPriority = destination.droppableId as "P0" | "P1" | "P2"

      // Build mutable copies of the groups
      const groupsCopy: Record<string, Story[]> = {
        P0: [...grouped.P0],
        P1: [...grouped.P1],
        P2: [...grouped.P2],
      }

      // Remove from source
      const [moved] = groupsCopy[sourcePriority].splice(source.index, 1)

      // Update priority if moving between groups
      if (sourcePriority !== destPriority) {
        moved.priority = destPriority
      }

      // Insert at destination
      groupsCopy[destPriority].splice(destination.index, 0, moved)

      // Flatten back into a single array (P0 → P1 → P2 order)
      const reordered = [
        ...groupsCopy.P0,
        ...groupsCopy.P1,
        ...groupsCopy.P2,
      ]
      onStoriesChange(reordered)
    },
    [grouped, onStoriesChange]
  )

  return (
    <div className="space-y-6">
      {/* Add story form */}
      {showAddForm && (
        <AddStoryForm
          onAdd={handleAddStory}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Drag context wraps all groups */}
      <DragDropContext onDragEnd={handleDragEnd}>
        {PRIORITY_GROUPS.map((group) => (
          <PriorityGroup
            key={group.key}
            groupKey={group.key}
            label={group.label}
            stories={grouped[group.key]}
            expandedIds={expandedIds}
            onToggleExpand={handleToggleExpand}
            onEditStory={handleEditStory}
            onDeleteStory={handleDeleteStory}
          />
        ))}
      </DragDropContext>

      {/* Empty state */}
      {stories.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <span className="text-sm text-[var(--text-muted)]">
            暂无用户故事
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            + 手动添加
          </Button>
        </div>
      )}

      {/* Stats footer */}
      {stories.length > 0 && (
        <div
          className={cn(
            "pt-3 border-t border-[var(--border)]",
            "text-xs text-[var(--text-muted)]",
            "tracking-[1px]",
          )}
        >
          共 {stats.total} 个故事 | P0: {stats.p0} | P1: {stats.p1} | P2:{" "}
          {stats.p2}
        </div>
      )}
    </div>
  )
}

export { StoryBoard }
