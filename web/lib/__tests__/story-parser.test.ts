import { describe, it, expect } from "vitest"
import { parseStories, storiesToMarkdown, type Story } from "../story-parser"

// ---------------------------------------------------------------------------
// parseStories
// ---------------------------------------------------------------------------

describe("parseStories", () => {
  it("returns empty array for empty input", () => {
    expect(parseStories("")).toEqual([])
    expect(parseStories("   ")).toEqual([])
  })

  it("parses structured markdown with priority groups", () => {
    const md = `## P0 高优先级

### 故事 1
**作为**教师，**我想要**查看班级考试报告，**以便**了解学生学情。

**验收标准：**
- [ ] 教师登录后能看到报告入口
- [ ] 点击进入报告详情页
- [ ] 报告包含成绩分布和知识点分析

### 故事 2
**作为**学情管理员，**我想要**导出成绩数据，**以便**进行校级分析。

**验收标准：**
- [ ] 能选择导出范围
- [ ] 支持 Excel 格式

## P1 中优先级

### 故事 3
**作为**家长，**我想要**查看孩子成绩趋势，**以便**跟踪学习进展。

**验收标准：**
- [ ] 趋势图展示近5次考试
`

    const stories = parseStories(md)

    expect(stories).toHaveLength(3)

    // First story
    expect(stories[0].role).toBe("教师")
    expect(stories[0].want).toBe("查看班级考试报告")
    expect(stories[0].benefit).toBe("了解学生学情")
    expect(stories[0].priority).toBe("P0")
    expect(stories[0].acceptance).toHaveLength(3)
    expect(stories[0].acceptance[0]).toBe("教师登录后能看到报告入口")

    // Second story
    expect(stories[1].role).toBe("学情管理员")
    expect(stories[1].want).toBe("导出成绩数据")
    expect(stories[1].priority).toBe("P0")
    expect(stories[1].acceptance).toHaveLength(2)

    // Third story (different priority group)
    expect(stories[2].role).toBe("家长")
    expect(stories[2].priority).toBe("P1")
    expect(stories[2].acceptance).toHaveLength(1)
  })

  it("parses plain text format (no bold markers)", () => {
    const md = `## P2 低优先级

### 故事 1
作为管理员，我想要配置权限，以便控制数据访问。

**验收标准：**
- [ ] 能设置角色权限
`

    const stories = parseStories(md)
    expect(stories).toHaveLength(1)
    expect(stories[0].role).toBe("管理员")
    expect(stories[0].want).toBe("配置权限")
    expect(stories[0].benefit).toBe("控制数据访问")
    expect(stories[0].priority).toBe("P2")
  })

  it("handles missing acceptance criteria gracefully", () => {
    const md = `## P0 高优先级

### 故事 1
**作为**教师，**我想要**查看报告，**以便**了解学情。
`

    const stories = parseStories(md)
    expect(stories).toHaveLength(1)
    expect(stories[0].acceptance).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// storiesToMarkdown
// ---------------------------------------------------------------------------

describe("storiesToMarkdown", () => {
  it("converts stories back to markdown", () => {
    const stories: Story[] = [
      {
        id: "1",
        role: "教师",
        want: "查看报告",
        benefit: "了解学情",
        priority: "P0",
        acceptance: ["能看到入口", "能打开详情"],
      },
      {
        id: "2",
        role: "家长",
        want: "查看成绩",
        benefit: "跟踪进展",
        priority: "P1",
        acceptance: [],
      },
    ]

    const md = storiesToMarkdown(stories)

    expect(md).toContain("## P0 高优先级")
    expect(md).toContain("## P1 中优先级")
    expect(md).not.toContain("## P2 低优先级") // no P2 stories
    expect(md).toContain("**作为**教师，**我想要**查看报告，**以便**了解学情。")
    expect(md).toContain("- [ ] 能看到入口")
    expect(md).toContain("- [ ] 能打开详情")
    expect(md).toContain("**作为**家长，**我想要**查看成绩，**以便**跟踪进展。")
  })

  it("returns empty-ish string for no stories", () => {
    const md = storiesToMarkdown([])
    expect(md.trim()).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Round-trip: parse → serialize → re-parse
// ---------------------------------------------------------------------------

describe("round-trip", () => {
  it("preserves story data through parse → markdown → parse", () => {
    const original = `## P0 高优先级

### 故事 1
**作为**教师，**我想要**查看班级考试报告，**以便**了解学生学情。

**验收标准：**
- [ ] 教师登录后能看到报告入口
- [ ] 报告包含成绩分布

## P1 中优先级

### 故事 1
**作为**家长，**我想要**查看成绩趋势，**以便**跟踪学习进展。

**验收标准：**
- [ ] 趋势图展示近5次考试
`

    const parsed = parseStories(original)
    const serialized = storiesToMarkdown(parsed)
    const reparsed = parseStories(serialized)

    expect(reparsed).toHaveLength(parsed.length)
    for (let i = 0; i < parsed.length; i++) {
      expect(reparsed[i].role).toBe(parsed[i].role)
      expect(reparsed[i].want).toBe(parsed[i].want)
      expect(reparsed[i].benefit).toBe(parsed[i].benefit)
      expect(reparsed[i].priority).toBe(parsed[i].priority)
      expect(reparsed[i].acceptance).toEqual(parsed[i].acceptance)
    }
  })
})
