import { Outlet } from "react-router-dom"
import { SidebarShell } from "@/components/layout/SidebarShell"
import { TitleBar } from "@/components/layout/TitleBar"

export function AppLayout() {
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
