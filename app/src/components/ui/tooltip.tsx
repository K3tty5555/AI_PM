import React from "react"
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip"
import { cn } from "@/lib/utils"

/* ── Public API ──────────────────────────────────────────────── */

interface TooltipProps {
  /** Tooltip text content */
  content: string
  /** Optional keyboard shortcut displayed as <kbd> */
  shortcut?: string
  /** Which side of the trigger to prefer (flips automatically) */
  side?: "top" | "bottom" | "left" | "right"
  /** Hover delay in ms before showing */
  delay?: number
  children: React.ReactElement
}

/**
 * Tooltip — wraps a single trigger element and shows a
 * positioned popup with optional keyboard-shortcut badge.
 *
 * Uses @base-ui/react Tooltip primitives.
 */
export function Tooltip({
  content,
  shortcut,
  side = "bottom",
  delay = 300,
  children,
}: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger
        delay={delay}
        render={children}
      />

      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6}>
          <BaseTooltip.Popup
            className={cn(
              "z-70 flex items-center gap-2",
              "rounded-md px-2.5 py-1.5",
              "bg-[var(--tooltip-bg)] shadow-[var(--shadow-lg)]",
              "origin-[var(--transform-origin)]",
              "transition-[transform,opacity] duration-150 ease-[var(--ease-standard)]",
              /* enter / exit states driven by base-ui data attributes */
              "data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0",
            )}
          >
            <BaseTooltip.Arrow
              className={cn(
                "data-[side=top]:bottom-[-3px]",
                "data-[side=bottom]:top-[-3px]",
                "data-[side=left]:right-[-3px]",
                "data-[side=right]:left-[-3px]",
              )}
            >
              <TooltipArrowSvg />
            </BaseTooltip.Arrow>

            <span className="text-xs font-medium leading-none text-[var(--tooltip-fg)]">
              {content}
            </span>

            {shortcut && (
              <kbd
                className={cn(
                  "ml-0.5 text-[11px] leading-none font-medium",
                  "text-[var(--tooltip-kbd)]",
                )}
              >
                {shortcut}
              </kbd>
            )}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}

/* ── Tooltip Provider (re-export for app root) ───────────────── */

export const TooltipProvider = BaseTooltip.Provider

/* ── Arrow SVG ───────────────────────────────────────────────── */

function TooltipArrowSvg() {
  return (
    <svg width="12" height="6" viewBox="0 0 12 6" fill="none">
      <path
        d="M0.351562 0H11.6484L6.71484 4.93359C6.31953 5.32891 5.68047 5.32891 5.28516 4.93359L0.351562 0Z"
        fill="var(--tooltip-bg)"
      />
    </svg>
  )
}
