import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  Home,
  Settings2,
  Plus,
  PanelLeft,
  Moon,
  FolderOpen,
  ListOrdered,
  CalendarDays,
  Library,
  Bot,
  BarChart2,
  Mic,
  Palette,
  Search,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { api } from "@/lib/tauri-api"
import type { ProjectSummary } from "@/lib/tauri-api"

/* ─── Types ──────────────────────────────────────────────── */

interface CommandItem {
  id: string
  label: string
  icon: LucideIcon
  action: () => void
  shortcut?: string
  group: string
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onToggleSidebar: () => void
  onCycleTheme: () => void
}

/* ─── Group ordering ─────────────────────────────────────── */

const GROUP_ORDER = ["导航", "操作", "视图", "项目", "工具"]

/* ─── Component ──────────────────────────────────────────── */

function CommandPalette({
  open,
  onClose,
  onToggleSidebar,
  onCycleTheme,
}: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Load projects when palette opens
  useEffect(() => {
    if (!open) return
    api.listProjects()
      .then(setProjects)
      .catch((err) => console.error("[CommandPalette] Failed to load projects:", err))
  }, [open])

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Build command list
  const commands: CommandItem[] = useMemo(() => {
    const openNewProject = () => {
      onClose()
      window.dispatchEvent(new Event("open-new-project-dialog"))
    }

    const nav = (path: string) => () => {
      onClose()
      navigate(path)
    }

    const staticCommands: CommandItem[] = [
      { id: "home", label: "返回首页", icon: Home, action: nav("/"), shortcut: "\u2318H", group: "导航" },
      { id: "settings", label: "打开设置", icon: Settings2, action: nav("/settings"), shortcut: "\u2318,", group: "导航" },
      { id: "new-project", label: "新建项目", icon: Plus, action: openNewProject, shortcut: "\u2318N", group: "操作" },
      { id: "toggle-sidebar", label: "切换侧边栏", icon: PanelLeft, action: () => { onClose(); onToggleSidebar() }, shortcut: "\u2318B", group: "视图" },
      { id: "toggle-theme", label: "切换主题", icon: Moon, action: () => { onClose(); onCycleTheme() }, shortcut: "\u2318D", group: "视图" },
    ]

    const projectCommands: CommandItem[] = projects.map((p) => ({
      id: `proj-${p.id}`,
      label: p.name,
      icon: FolderOpen,
      action: nav(`/project/${p.id}/requirement`),
      group: "项目",
    }))

    const toolCommands: CommandItem[] = [
      { id: "priority", label: "需求优先级", icon: ListOrdered, action: nav("/tools/priority"), group: "工具" },
      { id: "weekly", label: "工作周报", icon: CalendarDays, action: nav("/tools/weekly"), group: "工具" },
      { id: "knowledge", label: "知识库", icon: Library, action: nav("/tools/knowledge"), group: "工具" },
      { id: "persona", label: "产品分身", icon: Bot, action: nav("/tools/persona"), group: "工具" },
      { id: "data", label: "数据洞察", icon: BarChart2, action: nav("/tools/data"), group: "工具" },
      { id: "interview", label: "现场调研", icon: Mic, action: nav("/tools/interview"), group: "工具" },
      { id: "design-spec", label: "设计规范", icon: Palette, action: nav("/tools/design-spec"), group: "工具" },
    ]

    return [...staticCommands, ...projectCommands, ...toolCommands]
  }, [projects, navigate, onClose, onToggleSidebar, onCycleTheme])

  // Filter by query
  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(q))
  }, [commands, query])

  // Group filtered results
  const grouped = useMemo(() => {
    const groups: { group: string; items: CommandItem[] }[] = []
    const groupMap = new Map<string, CommandItem[]>()

    for (const item of filtered) {
      const existing = groupMap.get(item.group)
      if (existing) {
        existing.push(item)
      } else {
        const arr = [item]
        groupMap.set(item.group, arr)
        groups.push({ group: item.group, items: arr })
      }
    }

    // Sort by GROUP_ORDER
    groups.sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a.group)
      const bi = GROUP_ORDER.indexOf(b.group)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

    return groups
  }, [filtered])

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  // Clamp active index when filtered results change
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector("[data-active='true']")
    activeEl?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % Math.max(flatItems.length, 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((prev) => (prev - 1 + flatItems.length) % Math.max(flatItems.length, 1))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const item = flatItems[activeIndex]
        if (item) item.action()
      } else if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    },
    [flatItems, activeIndex, onClose]
  )

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose()
  }

  if (!open) return null

  let flatIndex = -1

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
    >
      <div
        className="mt-[20vh] h-fit w-[560px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xl)]"
        style={{
          animation: "commandPaletteIn 200ms var(--ease-decelerate)",
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Search size={18} className="shrink-0 text-[var(--text-tertiary)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索命令..."
            className="flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--border)]" />

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-2">
          {flatItems.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-[var(--text-tertiary)]">
              无匹配结果
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.group}>
                {/* Group header */}
                <div className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase text-[var(--text-tertiary)]">
                  {group.group}
                </div>
                {group.items.map((item) => {
                  flatIndex++
                  const isActive = flatIndex === activeIndex
                  const Icon = item.icon
                  const currentFlatIndex = flatIndex

                  return (
                    <button
                      key={item.id}
                      data-active={isActive}
                      onClick={() => item.action()}
                      onMouseEnter={() => setActiveIndex(currentFlatIndex)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors"
                      style={{
                        backgroundColor: isActive ? "var(--hover-bg)" : "transparent",
                      }}
                    >
                      <Icon size={18} className="shrink-0 text-[var(--text-secondary)]" />
                      <span className="flex-1 text-sm text-[var(--text-primary)]">
                        {item.label}
                      </span>
                      {item.shortcut && (
                        <kbd className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)]">
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-tertiary)]">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--background)] px-1 py-px text-[10px]">&uarr;</kbd>
            <kbd className="rounded border border-[var(--border)] bg-[var(--background)] px-1 py-px text-[10px]">&darr;</kbd>
            导航
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--background)] px-1 py-px text-[10px]">&crarr;</kbd>
            执行
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-[var(--border)] bg-[var(--background)] px-1 py-px text-[10px]">Esc</kbd>
            关闭
          </span>
        </div>
      </div>
    </div>
  )
}

export { CommandPalette }
export type { CommandPaletteProps, CommandItem }
