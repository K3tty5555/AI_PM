import { Outlet } from "react-router-dom"
import { TitleBar } from "@/components/layout/TitleBar"
import { SidebarShell } from "@/components/layout/SidebarShell"

export function ToolsLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <SidebarShell />
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
