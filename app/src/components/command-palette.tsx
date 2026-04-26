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
  ImagePlus,
  Stethoscope,
  Search,
  BookOpen,
  FileText,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { api } from "@/lib/tauri-api"
import type { ProjectSummary, KnowledgeEntry } from "@/lib/tauri-api"

/* ─── Types ──────────────────────────────────────────────── */

interface CommandItem {
  id: string
  label: string
  subtitle?: string
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

const GROUP_ORDER = ["导航", "操作", "视图", "项目", "工具", "知识库"]

/* ─── Fuzzy matching helper ──────────────────────────────── */

/** Check if `query` chars appear in `text` in order (case-insensitive). */
function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  // Fast path: substring match
  if (t.includes(q)) return true
  // Subsequence match for short queries
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const found = t.indexOf(q[qi], ti)
    if (found === -1) return false
    ti = found + 1
  }
  return true
}

/** Highlight matching characters in a label. Returns React nodes. */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const q = query.toLowerCase()
  const t = text.toLowerCase()

  // Try substring highlight first
  const subIdx = t.indexOf(q)
  if (subIdx !== -1) {
    return (
      <>
        {text.slice(0, subIdx)}
        <span className="text-[var(--accent-color)] font-medium">
          {text.slice(subIdx, subIdx + q.length)}
        </span>
        {text.slice(subIdx + q.length)}
      </>
    )
  }

  // Subsequence highlight
  const chars: React.ReactNode[] = []
  let qi = 0
  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && t[i] === q[qi]) {
      chars.push(
        <span key={i} className="text-[var(--accent-color)] font-medium">
          {text[i]}
        </span>
      )
      qi++
    } else {
      chars.push(text[i])
    }
  }
  return <>{chars}</>
}

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
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load projects when palette opens
  useEffect(() => {
    if (!open) return
    api.listProjects()
      .then(setProjects)
      .catch((err) => console.error("[CommandPalette] Failed to load projects:", err))
  }, [open])

  // Reset state on open/close
  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      setKnowledgeResults([])
      setIsSearching(false)
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Debounced knowledge search when query has 2+ chars
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setKnowledgeResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    searchTimerRef.current = setTimeout(() => {
      api.searchKnowledge(trimmed)
        .then((results) => {
          setKnowledgeResults(results.slice(0, 5)) // Limit to 5 results
          setIsSearching(false)
        })
        .catch((err) => {
          console.error("[CommandPalette] Knowledge search failed:", err)
          setKnowledgeResults([])
          setIsSearching(false)
        })
    }, 200)

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
        searchTimerRef.current = null
      }
    }
  }, [query])

  // Build command list (static commands + projects + tools)
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
      subtitle: p.description || undefined,
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
      { id: "illustration", label: "流程图配图", icon: ImagePlus, action: nav("/tools/illustration"), group: "工具" },
      { id: "design-spec", label: "设计规范", icon: Palette, action: nav("/tools/design-spec"), group: "工具" },
      { id: "doctor", label: "诊断中心", icon: Stethoscope, action: nav("/tools/doctor"), group: "工具" },
    ]

    return [...staticCommands, ...projectCommands, ...toolCommands]
  }, [projects, navigate, onClose, onToggleSidebar, onCycleTheme])

  // Filter commands by query (fuzzy matching on label + subtitle)
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.trim()
    return commands.filter((cmd) =>
      fuzzyMatch(cmd.label, q) || (cmd.subtitle && fuzzyMatch(cmd.subtitle, q))
    )
  }, [commands, query])

  // Build knowledge command items from search results
  const knowledgeCommands: CommandItem[] = useMemo(() => {
    if (knowledgeResults.length === 0) return []

    return knowledgeResults.map((entry) => ({
      id: `kb-${entry.id}`,
      label: entry.title,
      subtitle: entry.category,
      icon: getCategoryIcon(entry.category),
      action: () => {
        onClose()
        navigate("/tools/knowledge")
      },
      group: "知识库",
    }))
  }, [knowledgeResults, navigate, onClose])

  // Merge filtered commands + knowledge results
  const filtered = useMemo(() => {
    return [...filteredCommands, ...knowledgeCommands]
  }, [filteredCommands, knowledgeCommands])

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
  }, [query, knowledgeResults])

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

  const trimmedQuery = query.trim()
  let flatIndex = -1

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex justify-center bg-black/30 backdrop-blur-[4px]"
      style={{ animation: "fadeIn 150ms var(--ease-decelerate)" }}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
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
            placeholder="输入命令或搜索项目..."
            className="flex-1 bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
          />
          {isSearching && (
            <div className="shrink-0 h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent-color)]" />
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--border)]" />

        {/* Results */}
        <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[400px] overflow-y-auto py-2">
          {flatItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <Search size={32} className="text-[var(--border)]" />
              <p className="text-sm text-[var(--text-tertiary)]">
                {trimmedQuery
                  ? "没有匹配的命令或项目"
                  : "输入关键词搜索命令、项目和知识库"}
              </p>
              {trimmedQuery && trimmedQuery.length < 2 && (
                <p className="text-xs text-[var(--text-tertiary)]">
                  输入两个字以上可搜索知识库
                </p>
              )}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.group}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[11px] font-medium text-[var(--text-tertiary)]">
                  <span>{group.group}</span>
                  {trimmedQuery && (
                    <span className="rounded-full bg-[var(--secondary)] px-1.5 py-px text-[10px]">
                      {group.items.length}
                    </span>
                  )}
                </div>
                {group.items.map((item) => {
                  flatIndex++
                  const isActive = flatIndex === activeIndex
                  const Icon = item.icon
                  const currentFlatIndex = flatIndex

                  return (
                    <button
                      key={item.id}
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive}
                      onClick={() => item.action()}
                      onMouseEnter={() => setActiveIndex(currentFlatIndex)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors"
                      style={{
                        backgroundColor: isActive ? "var(--hover-bg)" : "transparent",
                      }}
                    >
                      <Icon size={18} className="shrink-0 text-[var(--text-secondary)]" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-[var(--text-primary)]">
                          {trimmedQuery
                            ? highlightMatch(item.label, trimmedQuery)
                            : item.label}
                        </span>
                        {item.subtitle && (
                          <span className="ml-2 text-xs text-[var(--text-tertiary)] truncate">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
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
          {trimmedQuery && flatItems.length > 0 && (
            <span className="ml-auto">
              {flatItems.length} 个结果
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Helpers ────────────────────────────────────────────── */

/** Map knowledge category to an icon. */
function getCategoryIcon(category: string): LucideIcon {
  const map: Record<string, LucideIcon> = {
    patterns: BookOpen,
    decisions: FileText,
    pitfalls: FileText,
    metrics: BarChart2,
    playbooks: BookOpen,
    insights: BookOpen,
  }
  return map[category] || BookOpen
}

export { CommandPalette }
export type { CommandPaletteProps, CommandItem }
