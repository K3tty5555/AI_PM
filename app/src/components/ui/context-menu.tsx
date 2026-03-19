import * as React from "react"
import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  label: string
  icon?: React.ElementType // lucide-react icon
  shortcut?: string
  action: () => void
  variant?: "default" | "destructive"
  separator?: boolean // show separator AFTER this item
  hidden?: boolean
}

export interface ContextMenuProps {
  items: ContextMenuItem[]
  children: React.ReactNode // right-click target area
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const popupStyles: React.CSSProperties = {
  minWidth: 180,
  padding: 4,
  zIndex: 80,
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContextMenu({ items, children }: ContextMenuProps) {
  const visibleItems = items.filter((item) => !item.hidden)

  if (visibleItems.length === 0) {
    return <>{children}</>
  }

  return (
    <BaseContextMenu.Root>
      <BaseContextMenu.Trigger
        className="contents"
      >
        {children}
      </BaseContextMenu.Trigger>

      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner sideOffset={4}>
          <BaseContextMenu.Popup
            className={cn(
              "rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-lg)]",
              "outline-none",
              // Enter animation
              "origin-[var(--transform-origin)]",
              "transition-[transform,opacity] duration-150 ease-out",
              "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
              "scale-100 opacity-100",
            )}
            style={popupStyles}
          >
            {visibleItems.map((item, index) => (
              <React.Fragment key={`${item.label}-${index}`}>
                <BaseContextMenu.Item
                  onClick={item.action}
                  className={cn(
                    "flex w-full cursor-default select-none items-center gap-2.5 rounded-md px-3 py-1.5",
                    "text-[13px] outline-none",
                    "transition-colors duration-100",
                    "data-[highlighted]:bg-[var(--hover-bg)]",
                    item.variant === "destructive"
                      ? "text-[var(--text-secondary)] data-[highlighted]:text-[var(--destructive)]"
                      : "text-[var(--text-primary)]",
                  )}
                >
                  {item.icon && (
                    <item.icon
                      className="size-4 shrink-0"
                      strokeWidth={1.75}
                      style={{
                        color: item.variant === "destructive"
                          ? "inherit"
                          : "var(--text-tertiary)",
                      }}
                    />
                  )}
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && (
                    <span className="ml-4 text-[11px] text-[var(--text-tertiary)]">
                      {item.shortcut}
                    </span>
                  )}
                </BaseContextMenu.Item>

                {item.separator && index < visibleItems.length - 1 && (
                  <div className="mx-2 my-1 h-px bg-[var(--border)]" />
                )}
              </React.Fragment>
            ))}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  )
}
