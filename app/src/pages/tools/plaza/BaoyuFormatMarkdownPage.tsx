import { useState } from "react"
import { useToolStream } from "@/hooks/use-tool-stream"
import { PlazaSkillPage } from "./PlazaSkillPage"

export function BaoyuFormatMarkdownPage() {
  const [content, setContent] = useState("")

  const { text, isStreaming, error, run, reset } = useToolStream("baoyu-format-markdown", {
    streamKeyPrefix: "plaza",
  })

  function handleRun() {
    if (!content.trim()) return
    run(content.trim())
  }

  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith(".md") || file.name.endsWith(".txt"))) {
      const reader = new FileReader()
      reader.onload = (ev) => setContent(ev.target?.result as string ?? "")
      reader.readAsText(file)
    }
  }

  return (
    <PlazaSkillPage
      title="Markdown 美化"
      description="自动添加标题、摘要、加粗、代码块等格式"
      source="baoyu"
      category="content"
      categoryLabel="内容处理"
      onRun={handleRun}
      onClear={() => { reset(); setContent("") }}
      running={isStreaming}
      output={text}
      error={error}
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        placeholder="粘贴纯文本或 Markdown，或拖拽 .md 文件到此处..."
        rows={5}
        className="w-full rounded-lg border border-[var(--border)] border-dashed bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
      />
    </PlazaSkillPage>
  )
}
