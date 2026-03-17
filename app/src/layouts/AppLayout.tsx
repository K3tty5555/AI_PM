import type { CSSProperties } from "react"
import { Outlet } from "react-router-dom"
import { SidebarShell } from "@/components/layout/SidebarShell"
import { TitleBar } from "@/components/layout/TitleBar"

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--background)]">
      <TitleBar />
      {/* Sidebar is fixed so backdrop-filter blurs the scrolling content behind it */}
      <SidebarShell />
      <main
        className="flex-1 overflow-y-auto p-8"
        style={{
          marginLeft: 220,
          marginTop: 44,
          height: "calc(100vh - 44px)",
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
