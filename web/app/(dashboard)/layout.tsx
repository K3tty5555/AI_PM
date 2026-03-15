import { TopBar } from "@/components/layout/top-bar"
import { SidebarShell } from "@/components/layout/sidebar-shell"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <TopBar />

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        <SidebarShell />

        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
