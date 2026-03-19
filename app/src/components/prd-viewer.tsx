import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import { MermaidRenderer } from "@/components/mermaid-renderer"
import { slugify } from "@/components/prd-toc"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PrdViewerProps {
  markdown: string
  isStreaming: boolean
  onEdit?: (newMarkdown: string) => void
}

// ---------------------------------------------------------------------------
// Inline editing hook — double-click a block to edit
// ---------------------------------------------------------------------------

function useBlockEditor(
  markdown: string,
  onEdit?: (newMarkdown: string) => void
) {
  const [editingBlock, setEditingBlock] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")

  // Split markdown into line blocks at ## or ### boundaries for editing
  // (We don't actually replace per-block — we track the line range and
  //  splice back in. For MVP, we just let the user edit the full text
  //  via a textarea overlay on the clicked paragraph.)

  const startEditing = useCallback(
    (blockIndex: number, currentText: string) => {
      setEditingBlock(blockIndex)
      setEditValue(currentText)
    },
    []
  )

  const commitEdit = useCallback(
    (originalText: string) => {
      if (editValue !== originalText && onEdit) {
        const updated = markdown.replace(originalText, editValue)
        onEdit(updated)
      }
      setEditingBlock(null)
      setEditValue("")
    },
    [editValue, markdown, onEdit]
  )

  const cancelEdit = useCallback(() => {
    setEditingBlock(null)
    setEditValue("")
  }, [])

  return { editingBlock, editValue, setEditValue, startEditing, commitEdit, cancelEdit }
}

// ---------------------------------------------------------------------------
// Typing cursor
// ---------------------------------------------------------------------------

function TypingCursor() {
  return (
    <span
      className={cn(
        "inline-block w-2 h-4 ml-0.5 align-middle",
        "bg-[var(--yellow)]",
        "animate-[blink_1s_step-end_infinite]",
      )}
      aria-hidden
    />
  )
}

// ---------------------------------------------------------------------------
// Editable wrapper — wraps a block so double-click opens a textarea
// ---------------------------------------------------------------------------

function EditableBlock({
  children,
  rawText,
  blockIndex,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onCommit,
  onCancel,
  editable,
}: {
  children: React.ReactNode
  rawText: string
  blockIndex: number
  isEditing: boolean
  editValue: string
  onEditValueChange: (v: string) => void
  onStartEdit: (index: number, text: string) => void
  onCommit: (originalText: string) => void
  onCancel: () => void
  editable: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      // Auto-resize
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px"
    }
  }, [isEditing])

  if (isEditing) {
    return (
      <div className="relative my-1">
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => {
            onEditValueChange(e.target.value)
            // Auto-resize
            e.target.style.height = "auto"
            e.target.style.height = e.target.scrollHeight + "px"
          }}
          onBlur={() => onCommit(rawText)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              onCancel()
            }
            // Ctrl/Cmd + Enter to commit
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onCommit(rawText)
            }
          }}
          className={cn(
            "w-full min-h-[60px] p-3 text-sm",
            "bg-[var(--yellow-bg)] text-[var(--dark)]",
            "border border-[var(--yellow)]",
            "font-mono",
            "outline-none resize-none",
            "leading-relaxed",
          )}
        />
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">
            ESC 取消 · Cmd+Enter 确认
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      onDoubleClick={() => {
        if (editable) {
          onStartEdit(blockIndex, rawText)
        }
      }}
      className={cn(
        editable && "cursor-text hover:bg-[var(--yellow-bg)] transition-colors duration-150",
      )}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Markdown components for react-markdown (终末地 style)
// ---------------------------------------------------------------------------

/** Counter for generating unique block indices per render cycle */
let blockCounter = 0

function createMarkdownComponents(
  editor: ReturnType<typeof useBlockEditor>,
  editable: boolean
) {
  // Reset counter each time components are created (each render)
  blockCounter = 0

  return {
    h2: ({ children, ...props }: React.ComponentProps<"h2">) => {
      const text =
        typeof children === "string"
          ? children
          : Array.isArray(children)
            ? children.map(String).join("")
            : String(children ?? "")
      const id = slugify(text)

      return (
        <h2
          id={id}
          className={cn(
            "relative text-base font-semibold text-[var(--dark)]",
            "mt-8 mb-3 pl-4",
            "before:absolute before:left-0 before:top-0 before:bottom-0",
            "before:w-[3px] before:bg-[var(--yellow)] before:content-['']",
          )}
          {...props}
        >
          {children}
        </h2>
      )
    },

    h3: ({ children, ...props }: React.ComponentProps<"h3">) => {
      const text =
        typeof children === "string"
          ? children
          : Array.isArray(children)
            ? children.map(String).join("")
            : String(children ?? "")
      const id = slugify(text)

      return (
        <h3
          id={id}
          className="text-sm font-semibold text-[var(--dark)] mt-5 mb-2"
          {...props}
        >
          {children}
        </h3>
      )
    },

    h4: ({ children, ...props }: React.ComponentProps<"h4">) => (
      <h4
        className="text-sm font-semibold text-[var(--dark)] mt-4 mb-1"
        {...props}
      >
        {children}
      </h4>
    ),

    p: ({ children, ...props }: React.ComponentProps<"p">) => {
      const idx = blockCounter++
      const rawText =
        typeof children === "string"
          ? children
          : Array.isArray(children)
            ? children.map(String).join("")
            : String(children ?? "")

      return (
        <EditableBlock
          rawText={rawText}
          blockIndex={idx}
          isEditing={editor.editingBlock === idx}
          editValue={editor.editValue}
          onEditValueChange={editor.setEditValue}
          onStartEdit={editor.startEditing}
          onCommit={editor.commitEdit}
          onCancel={editor.cancelEdit}
          editable={editable}
        >
          <p
            className="text-sm text-[var(--dark)] leading-relaxed mb-3 last:mb-0"
            {...props}
          >
            {children}
          </p>
        </EditableBlock>
      )
    },

    ul: ({ children, ...props }: React.ComponentProps<"ul">) => (
      <ul
        className="text-sm text-[var(--dark)] list-disc pl-5 mb-3 space-y-1"
        {...props}
      >
        {children}
      </ul>
    ),

    ol: ({ children, ...props }: React.ComponentProps<"ol">) => (
      <ol
        className="text-sm text-[var(--dark)] list-decimal pl-5 mb-3 space-y-1"
        {...props}
      >
        {children}
      </ol>
    ),

    li: ({ children, ...props }: React.ComponentProps<"li">) => (
      <li className="text-sm text-[var(--dark)] leading-relaxed" {...props}>
        {children}
      </li>
    ),

    strong: ({ children, ...props }: React.ComponentProps<"strong">) => (
      <strong className="font-semibold text-[var(--dark)]" {...props}>
        {children}
      </strong>
    ),

    blockquote: ({
      children,
      ...props
    }: React.ComponentProps<"blockquote">) => (
      <blockquote
        className="border-l-2 border-[var(--yellow)] pl-3 my-3 text-sm text-[var(--text-muted)] italic"
        {...props}
      >
        {children}
      </blockquote>
    ),

    // Code blocks — detect mermaid language for diagram rendering
    code: ({
      className: codeClassName,
      children,
      ...props
    }: React.ComponentProps<"code">) => {
      const match = /language-(\w+)/.exec(codeClassName || "")
      const lang = match?.[1]

      // Mermaid diagram
      if (lang === "mermaid") {
        const chart =
          typeof children === "string"
            ? children
            : Array.isArray(children)
              ? children.join("")
              : String(children ?? "")
        return <MermaidRenderer chart={chart} />
      }

      // Inline code (no language class)
      const isInline = !codeClassName
      if (isInline) {
        return (
          <code
            className="px-1.5 py-0.5 text-xs bg-[var(--secondary)] border border-[var(--border)] font-mono"
            {...props}
          >
            {children}
          </code>
        )
      }

      // Fenced code block (non-mermaid)
      return (
        <code className={cn(codeClassName, "text-xs")} {...props}>
          {children}
        </code>
      )
    },

    // Fenced code block wrapper
    pre: ({ children, ...props }: React.ComponentProps<"pre">) => (
      <pre
        className={cn(
          "overflow-x-auto p-4 my-3 text-xs",
          "bg-[var(--secondary)] text-[var(--text-primary)]",
          "border-l-3 border-l-[var(--yellow)]",
          "font-mono",
        )}
        {...props}
      >
        {children}
      </pre>
    ),

    // Tables — 终末地 style: sharp corners, thin borders, alternating rows
    table: ({ children, ...props }: React.ComponentProps<"table">) => (
      <div className="overflow-x-auto my-3">
        <table
          className="text-sm w-full border-collapse border border-[var(--border)]"
          {...props}
        >
          {children}
        </table>
      </div>
    ),

    thead: ({ children, ...props }: React.ComponentProps<"thead">) => (
      <thead className="bg-[var(--secondary)]" {...props}>
        {children}
      </thead>
    ),

    th: ({ children, ...props }: React.ComponentProps<"th">) => (
      <th
        className={cn(
          "border border-[var(--border)] px-3 py-2",
          "text-left text-[11px] font-semibold",
          "text-[var(--text-primary)]",
        )}
        {...props}
      >
        {children}
      </th>
    ),

    tr: ({ children, ...props }: React.ComponentProps<"tr">) => (
      <tr
        className="even:bg-[var(--yellow-bg)] transition-colors duration-150"
        {...props}
      >
        {children}
      </tr>
    ),

    td: ({ children, ...props }: React.ComponentProps<"td">) => (
      <td
        className="border border-[var(--border)] px-3 py-2 text-sm"
        {...props}
      >
        {children}
      </td>
    ),

    hr: (props: React.ComponentProps<"hr">) => (
      <hr className="my-6 border-[var(--border)]" {...props} />
    ),

    a: ({ children, ...props }: React.ComponentProps<"a">) => (
      <a
        className="text-[var(--dark)] underline underline-offset-2 decoration-[var(--yellow)] hover:bg-[var(--yellow-bg)] transition-colors duration-150"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    ),
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PrdViewer({ markdown, isStreaming, onEdit }: PrdViewerProps) {
  const editor = useBlockEditor(markdown, onEdit)
  const editable = !isStreaming && !!onEdit

  const components = useMemo(
    () => createMarkdownComponents(editor, editable),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor.editingBlock, editor.editValue, editable]
  )

  if (!markdown && !isStreaming) {
    return null
  }

  // Streaming with no content yet
  if (!markdown && isStreaming) {
    return (
      <div className="flex items-center gap-3 py-8">
        <span
          className={cn(
            "inline-block w-2 h-2 bg-[var(--yellow)]",
            "animate-[dotPulse_2s_ease-in-out_infinite]",
          )}
          style={{ borderRadius: "50%" }}
        />
        <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
          GENERATING PRD...
        </span>
      </div>
    )
  }

  return (
    <div
      data-slot="prd-viewer"
      className="animate-[fadeInUp_0.28s_cubic-bezier(0.16,1,0.3,1)]"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>

      {/* Typing cursor at end during streaming */}
      {isStreaming && <TypingCursor />}
    </div>
  )
}

export { PrdViewer }
export type { PrdViewerProps }
