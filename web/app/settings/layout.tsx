import { TopBar } from "@/components/layout/top-bar"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="flex-1 overflow-y-auto px-6 py-10">
        <div className="mx-auto w-full max-w-[640px]">
          {children}
        </div>
      </main>
    </div>
  )
}
