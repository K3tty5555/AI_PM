import { TopBar } from "@/components/layout/top-bar"
import { SidebarShell } from "@/components/layout/sidebar-shell"
import { ProjectStageBar } from "@/components/layout/project-stage-bar"

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <TopBar />

      {/* Body: sidebar + stage nav + content */}
      <div className="flex flex-1 overflow-hidden">
        <SidebarShell />

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Stage navigation */}
          <ProjectStageBar />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
