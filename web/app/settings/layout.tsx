"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center border-b border-[var(--border)] bg-[var(--background)] px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
          className="gap-2"
        >
          <ArrowLeft className="size-4" />
          <span className="font-[var(--font-geist-mono),_'Courier_New',_monospace] text-xs tracking-[1px]">
            BACK
          </span>
        </Button>
      </header>

      {/* Content: centered, max-width 640px */}
      <main className="flex-1 overflow-y-auto px-6 py-10">
        <div className="mx-auto w-full max-w-[640px]">
          {children}
        </div>
      </main>
    </div>
  )
}
