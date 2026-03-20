// ============================================================
// Story Parser — Parse AI Markdown output into structured stories
// ============================================================

export interface Story {
  id: string
  role: string
  want: string
  benefit: string
  priority: "P0" | "P1" | "P2"
  acceptance: string[]
}

// ---------------------------------------------------------------------------
// Markdown → Story[]
// ---------------------------------------------------------------------------

let _idCounter = 0

function nextId(): string {
  _idCounter += 1
  return `story-${Date.now()}-${_idCounter}`
}

/**
 * Detect priority from a `##` heading line.
 * Matches patterns like "## P0 高优先级", "## P1", "## P2 低优先级" etc.
 */
function detectPriority(heading: string): "P0" | "P1" | "P2" | null {
  if (/P0|高优先/i.test(heading)) return "P0"
  if (/P1|中优先/i.test(heading)) return "P1"
  if (/P2|低优先/i.test(heading)) return "P2"
  return null
}

/**
 * Extract role / want / benefit from a story block.
 *
 * Expected formats:
 *   **作为**教师，**我想要**查看班级考试报告，**以便**了解学生学情。
 *   作为教师，我想要查看班级考试报告，以便了解学生学情。
 */
function extractStoryFields(block: string): {
  role: string
  want: string
  benefit: string
} | null {
  // Try bold-delimited format first
  const boldPattern =
    /\*{0,2}作为\*{0,2}\s*(.+?)[，,]\s*\*{0,2}(?:我想要?|我希望)\*{0,2}\s*(.+?)[，,]\s*\*{0,2}以便\*{0,2}\s*(.+?)(?:[。.；;]|$)/
  const match = block.match(boldPattern)
  if (match) {
    return {
      role: match[1].trim(),
      want: match[2].trim(),
      benefit: match[3].trim().replace(/[。.；;]+$/, ""),
    }
  }

  // Fallback: try plain text format
  const plainPattern =
    /作为\s*(.+?)[，,]\s*(?:我想要?|我希望)\s*(.+?)[，,]\s*以便\s*(.+?)(?:[。.；;]|$)/
  const plainMatch = block.match(plainPattern)
  if (plainMatch) {
    return {
      role: plainMatch[1].trim(),
      want: plainMatch[2].trim(),
      benefit: plainMatch[3].trim().replace(/[。.；;]+$/, ""),
    }
  }

  return null
}

/**
 * Extract acceptance criteria from a story block.
 * Looks for lines starting with `- [ ]` or `- [x]` or plain `- `.
 */
function extractAcceptance(block: string): string[] {
  const lines = block.split("\n")
  const criteria: string[] = []
  let inAcceptanceSection = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect acceptance section header
    if (/验收标准|acceptance/i.test(trimmed)) {
      inAcceptanceSection = true
      continue
    }

    // Collect checkbox items or bullet items after the header
    const checkboxMatch = trimmed.match(/^-\s*\[[ x]\]\s*(.+)/)
    if (checkboxMatch) {
      criteria.push(checkboxMatch[1].trim())
      inAcceptanceSection = true
      continue
    }

    // If we're in the acceptance section, also collect plain bullet items
    if (inAcceptanceSection) {
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)/)
      if (bulletMatch) {
        criteria.push(bulletMatch[1].trim())
        continue
      }
      // Empty line or non-bullet line ends the section
      if (trimmed && !trimmed.startsWith("-") && !trimmed.startsWith("*")) {
        inAcceptanceSection = false
      }
    }
  }

  return criteria
}

/**
 * Normalize multi-line story text so single-line regexes can match.
 * Joins "作为...,\n我想要..." style line breaks.
 */
function normalizeStoryText(text: string): string {
  return text
    .replace(/[，,]\s*\n\s*/g, "，")
    .replace(/\n\s+/g, " ")
}

/**
 * Extract priority from a "**优先级**：P0" style line.
 */
function extractInlinePriority(block: string): "P0" | "P1" | "P2" | null {
  const m = block.match(/优先级[：:]\s*(P[012])/i)
  return m ? (m[1] as "P0" | "P1" | "P2") : null
}

/**
 * Parse AI-generated markdown into a structured array of stories.
 *
 * Supports two formats:
 *   1. Priority-group: ## P0/P1/P2 > ### 故事 N > 作为...我想要...以便...
 *   2. Epic-group: ### Epic N > #### US-XXX-NNN > **用户故事**：作为...（multiline ok）
 */
export function parseStories(markdown: string): Story[] {
  if (!markdown.trim()) return []

  const stories: Story[] = []
  let currentPriority: "P0" | "P1" | "P2" = "P1" // default if no group heading

  // ── Strategy 1: Priority-group format (## P0/P1/P2 > ### story) ──────────
  const topSections = markdown.split(/^(?=## )/m)

  for (const section of topSections) {
    const trimmed = section.trim()
    if (!trimmed) continue

    // Check if this is a priority group heading
    const groupHeadingMatch = trimmed.match(/^## (.+)/)
    if (groupHeadingMatch) {
      const detected = detectPriority(groupHeadingMatch[1])
      if (detected) {
        currentPriority = detected
      }
    }

    // Split by ### to get individual stories within this group
    const storyBlocks = trimmed.split(/^(?=### )/m)

    for (const block of storyBlocks) {
      const blockTrimmed = block.trim()
      if (!blockTrimmed || blockTrimmed.startsWith("## ") && !blockTrimmed.includes("###")) {
        // This is just the group heading line, skip
        if (!blockTrimmed.includes("作为")) continue
      }

      const fields = extractStoryFields(normalizeStoryText(blockTrimmed))
      if (!fields) continue

      const acceptance = extractAcceptance(blockTrimmed)
      const inlinePrio = extractInlinePriority(blockTrimmed)

      stories.push({
        id: nextId(),
        role: fields.role,
        want: fields.want,
        benefit: fields.benefit,
        priority: inlinePrio ?? currentPriority,
        acceptance,
      })
    }
  }

  if (stories.length > 0) return stories

  // ── Strategy 2: Epic format (#### US-XXX-NNN: heading per story) ─────────
  const epicBlocks = markdown.split(/^(?=#### )/m)
  for (const block of epicBlocks) {
    if (!block.startsWith("####")) continue

    const normalized = normalizeStoryText(block)
    const fields = extractStoryFields(normalized)
    if (!fields) continue

    const priority = extractInlinePriority(block) ?? "P1"
    const acceptance = extractAcceptance(block)
    stories.push({ id: nextId(), ...fields, priority, acceptance })
  }

  if (stories.length > 0) return stories

  // ── Strategy 3: Line-by-line fallback ────────────────────────────────────
  // If no stories were found with the structured approach, try a simpler line-by-line scan
  if (stories.length === 0) {
    const lines = markdown.split("\n")
    let currentBlock = ""
    let blockPriority: "P0" | "P1" | "P2" = "P1"

    for (const line of lines) {
      const trimmed = line.trim()

      // Priority heading
      const priority = detectPriority(trimmed)
      if (priority) {
        blockPriority = priority
      }

      // Accumulate lines that might contain a story
      if (trimmed.includes("作为") && (trimmed.includes("想要") || trimmed.includes("希望"))) {
        // Process any pending block first
        if (currentBlock) {
          const fields = extractStoryFields(currentBlock)
          if (fields) {
            stories.push({
              id: nextId(),
              ...fields,
              priority: blockPriority,
              acceptance: extractAcceptance(currentBlock),
            })
          }
        }
        currentBlock = trimmed
      } else if (currentBlock) {
        currentBlock += "\n" + trimmed
      }
    }

    // Process last block
    if (currentBlock) {
      const fields = extractStoryFields(currentBlock)
      if (fields) {
        stories.push({
          id: nextId(),
          ...fields,
          priority: blockPriority,
          acceptance: extractAcceptance(currentBlock),
        })
      }
    }
  }

  return stories
}

// ---------------------------------------------------------------------------
// Story[] → Markdown
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<string, string> = {
  P0: "P0 高优先级",
  P1: "P1 中优先级",
  P2: "P2 低优先级",
}

export function storiesToMarkdown(stories: Story[]): string {
  const groups: Record<string, Story[]> = { P0: [], P1: [], P2: [] }

  for (const story of stories) {
    groups[story.priority].push(story)
  }

  const parts: string[] = []

  for (const priority of ["P0", "P1", "P2"] as const) {
    const group = groups[priority]
    if (group.length === 0) continue

    parts.push(`## ${PRIORITY_LABELS[priority]}\n`)

    group.forEach((story, index) => {
      parts.push(`### 故事 ${index + 1}`)
      parts.push(
        `**作为**${story.role}，**我想要**${story.want}，**以便**${story.benefit}。\n`
      )

      if (story.acceptance.length > 0) {
        parts.push("**验收标准：**")
        for (const criterion of story.acceptance) {
          parts.push(`- [ ] ${criterion}`)
        }
      }

      parts.push("") // blank line between stories
    })
  }

  return parts.join("\n").trim() + "\n"
}
