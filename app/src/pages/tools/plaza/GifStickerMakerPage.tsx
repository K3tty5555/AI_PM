import { useState, useRef } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"

export function GifStickerMakerPage() {
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [caption, setCaption] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { text, isStreaming, error, run, reset } = useToolStream("gif-sticker-maker", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!imagePath) return
    let input = `--image "${imagePath}"`
    if (caption.trim()) input += ` --caption "${caption.trim()}"`
    run(input)
  }

  function handleClear() {
    reset()
    setImagePath(null)
    setCaption("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <PlazaSkillPage
      title="GIF 贴纸"
      description="将照片转为 Funko Pop 风格动态 GIF 贴纸"
      source="minimax"
      category="image"
      categoryLabel="图像创作"
      onRun={handleRun}
      onClear={handleClear}
      running={isStreaming}
      output={text}
      error={error}
    >
      {/* Image Upload */}
      <div>
        <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">上传照片（必填）</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--bg-secondary)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text-primary)] file:cursor-pointer"
          onChange={(e) => {
            const f = e.target.files?.[0]
            setImagePath(f ? (f as File & { path?: string }).path ?? f.name : null)
          }}
        />
        {imagePath && (
          <p className="mt-1 text-xs text-[var(--text-tertiary)] truncate">
            已选择：{imagePath.split("/").pop() ?? imagePath}
          </p>
        )}
      </div>

      {/* Caption */}
      <div>
        <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">贴纸文字（可选）</span>
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="例如：Hello World！"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
        />
      </div>
    </PlazaSkillPage>
  )
}
