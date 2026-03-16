import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface InlineChatProps {
  question: string
  options?: string[]
  onAnswer?: (answer: string) => void
  isCollapsed?: boolean
  collapsedSummary?: string
  className?: string
}

function InlineChat({
  question,
  options,
  onAnswer,
  isCollapsed: controlledCollapsed,
  collapsedSummary,
  className,
}: InlineChatProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [answered, setAnswered] = useState<string | null>(null)

  const isCollapsed = controlledCollapsed ?? internalCollapsed

  const handleAnswer = useCallback(
    (answer: string) => {
      setAnswered(answer)
      setInternalCollapsed(true)
      onAnswer?.(answer)
    },
    [onAnswer]
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (inputValue.trim()) {
        handleAnswer(inputValue.trim())
        setInputValue("")
      }
    },
    [inputValue, handleAnswer]
  )

  const summary = collapsedSummary || (answered ? `已回答：${answered}` : question)

  if (isCollapsed) {
    return (
      <div
        data-slot="inline-chat"
        className={cn(
          "relative pl-5",
          "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--yellow)] before:content-['']",
          "animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]",
          className
        )}
      >
        <button
          type="button"
          onClick={() => setInternalCollapsed(false)}
          className={cn(
            "flex items-center gap-2 py-2 w-full text-left",
            "text-sm text-[var(--text-muted)]",
            "hover:text-[var(--dark)] transition-colors duration-[0.28s]",
            "cursor-pointer",
          )}
        >
          <span
            className={cn(
              "inline-block w-2 h-2 bg-[var(--green)]",
              "animate-[dotPulse_2s_ease-in-out_infinite]",
            )}
            style={{ borderRadius: "50%" }}
          />
          <span className="truncate">{summary}</span>
        </button>
      </div>
    )
  }

  return (
    <div
      data-slot="inline-chat"
      className={cn(
        "relative pl-5",
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--yellow)] before:content-['']",
        "animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]",
        className
      )}
    >
      <div className="py-3 space-y-3">
        {/* AI Question */}
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "inline-block w-2 h-2 mt-1.5 shrink-0 bg-[var(--green)]",
              "animate-[dotPulse_2s_ease-in-out_infinite]",
            )}
            style={{ borderRadius: "50%" }}
          />
          <p className="text-sm text-[var(--dark)] leading-relaxed font-medium">
            {question}
          </p>
        </div>

        {/* Quick options */}
        {options && options.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-4">
            {options.map((option) => (
              <Button
                key={option}
                variant="ghost"
                size="sm"
                onClick={() => handleAnswer(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        )}

        {/* Free input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 pl-4">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="输入你的回答..."
            className={cn(
              "flex-1 h-8 px-3",
              "text-sm text-[var(--dark)]",
              "bg-transparent border border-[var(--border)]",
              "placeholder:text-[var(--text-muted)]",
              "outline-none",
              "transition-[border-color] duration-[0.28s] ease-[cubic-bezier(0.16,1,0.3,1)]",
              "focus:border-[var(--yellow)]",
            )}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!inputValue.trim()}
          >
            发送
          </Button>
        </form>
      </div>
    </div>
  )
}

export { InlineChat }
export type { InlineChatProps }
