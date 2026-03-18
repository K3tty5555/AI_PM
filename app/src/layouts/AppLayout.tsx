import type { CSSProperties } from "react"
import { useState } from "react"
import { Outlet } from "react-router-dom"
import { SidebarShell } from "@/components/layout/SidebarShell"
import { TitleBar } from "@/components/layout/TitleBar"

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem("sidebar-open")
    return stored === null ? true : stored === "true"
  })

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-open", String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--background)]">
      <TitleBar sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
      <SidebarShell open={sidebarOpen} />
      <main
        className="min-h-0 flex-1 overflow-y-auto p-8"
        style={{
          marginLeft: sidebarOpen ? 220 : 0,
          transition: "margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as CSSProperties}
      >
        <style>{`main::-webkit-scrollbar { display: none; }`}</style>
        <Outlet />
      </main>
    </div>
  )
}
