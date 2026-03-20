import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { useEffect } from "react"
import { cn } from "@/lib/utils"

interface RichEditorProps {
  content?: string
  placeholder?: string
  onChange?: (content: string) => void
  editable?: boolean
  className?: string
}

function RichEditor({
  content = "",
  placeholder = "描述你的产品需求...",
  onChange,
  editable = true,
  className,
}: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: cn(
          "outline-none min-h-[200px] px-4 py-3",
          "text-sm leading-relaxed text-[var(--dark)]",
          "font-[var(--font-geist-sans),_sans-serif]",
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.is-editor-empty:first-child::before]:text-[var(--text-muted)]/50",
          "[&_.is-editor-empty:first-child::before]:float-left",
          "[&_.is-editor-empty:first-child::before]:h-0",
          "[&_.is-editor-empty:first-child::before]:pointer-events-none",
        ),
      },
    },
    onUpdate({ editor: e }) {
      onChange?.(e.getText())
    },
    // Prevent SSR mismatch — Tiptap renders an empty shell on server
    immediatelyRender: false,
  })

  // Sync editable prop
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  return (
    <div
      data-slot="rich-editor"
      className={cn(
        "group/editor relative",
        "border border-[var(--border)] bg-[var(--background)]",
        "transition-all duration-[var(--duration-terminal)] ease-[var(--ease-terminal)]",
        // Focus state: yellow left stripe
        "focus-within:border-[var(--border)] focus-within:shadow-none",
        "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:content-['']",
        "before:bg-transparent before:transition-colors before:duration-[var(--duration-terminal)] before:ease-[var(--ease-terminal)]",
        "focus-within:before:bg-[var(--accent-color)]",
        className
      )}
    >
      <EditorContent editor={editor} />
    </div>
  )
}

export { RichEditor }
export type { RichEditorProps }
