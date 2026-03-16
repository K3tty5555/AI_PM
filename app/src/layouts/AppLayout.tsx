import { Outlet } from "react-router-dom"
import { TitleBar } from "@/components/layout/TitleBar"

export function AppLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
