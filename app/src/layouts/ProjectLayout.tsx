import { Outlet } from "react-router-dom"
import { TitleBar } from "@/components/layout/TitleBar"
import { SidebarShell } from "@/components/layout/SidebarShell"
import { ProjectStageBar } from "@/components/layout/ProjectStageBar"

export function ProjectLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <SidebarShell />
        <div className="flex flex-1 flex-col overflow-hidden">
          <ProjectStageBar />
          <main className="flex-1 overflow-y-auto p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
