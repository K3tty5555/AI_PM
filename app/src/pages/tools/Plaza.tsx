import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import * as LucideIcons from "lucide-react"
import { usePlaza } from "@/hooks/use-plaza"
import { cn } from "@/lib/utils"

export function ToolPlazaPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { manifest, loading, error } = usePlaza()

  const initialCategory = searchParams.get("category") ?? "image"
  const [activeCategory, setActiveCategory] = useState(initialCategory)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--text-tertiary)]">
        加载中...
      </div>
    )
  }

  if (error || !manifest) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--destructive)]">
        加载功能广场失败：{error}
      </div>
    )
  }

  const categories = manifest.categories
  const skills = manifest.skills.filter((s) => s.category === activeCategory)

  function CategoryIcon({ name }: { name: string }) {
    const pascal = name
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Icon = (LucideIcons as Record<string, any>)[pascal] as React.FC<{ className?: string }> | undefined
    return Icon ? <Icon className="size-4" /> : null
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">功能广场</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">
          封装 baoyu & MiniMax 能力，CLI 模式专属
        </p>
      </div>

      {/* Category Tabs */}
      <div className="shrink-0 flex gap-1 px-6 pt-4 pb-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeCategory === cat.id
                ? "bg-[var(--accent-color)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
            )}
          >
            <CategoryIcon name={cat.icon} />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Skill Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid gap-3 grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => (
            <button
              key={skill.id}
              onClick={() => navigate(`/tools/plaza/${skill.id}`)}
              className="text-left p-4 rounded-xl border border-[var(--border)] hover:border-[var(--accent-color)] hover:shadow-sm transition-all bg-[var(--bg-primary)]"
            >
              <div className="mb-2">
                <span className="font-medium text-sm text-[var(--text-primary)]">
                  {skill.displayName}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed line-clamp-2">
                {skill.description}
              </p>
              <div className="mt-2">
                <span
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded font-medium",
                    skill.source === "baoyu"
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                  )}
                >
                  {skill.source}
                </span>
              </div>
            </button>
          ))}
        </div>
        {skills.length === 0 && (
          <p className="text-sm text-[var(--text-tertiary)] text-center mt-8">该分类暂无技能</p>
        )}
      </div>
    </div>
  )
}
