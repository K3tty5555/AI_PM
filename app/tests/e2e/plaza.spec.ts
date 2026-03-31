import { test, expect } from "./fixtures"

// 所有 plaza skill 路由，与 router.tsx 保持一致
const PLAZA_ROUTES = [
  { id: "baoyu-imagine",             label: "AI 文生图" },
  { id: "baoyu-cover-image",         label: "文章封面" },
  { id: "baoyu-article-illustrator", label: "文章配图" },
  { id: "baoyu-infographic",         label: "信息图" },
  { id: "baoyu-xhs-images",          label: "小红书图片" },
  { id: "baoyu-comic",               label: "知识漫画" },
  { id: "gif-sticker-maker",         label: "GIF 贴纸" },
  { id: "minimax-multimodal-image",  label: "MiniMax 图像" },
  { id: "pptx-generator",            label: "PPT 生成" },
  { id: "baoyu-slide-deck",          label: "图片幻灯片" },
  { id: "minimax-pdf",               label: "PDF 生成" },
  { id: "minimax-docx",              label: "Word 文档" },
  { id: "minimax-xlsx",              label: "Excel 表格" },
  { id: "baoyu-translate",           label: "翻译" },
  { id: "baoyu-format-markdown",     label: "Markdown 美化" },
  { id: "baoyu-markdown-to-html",    label: "微信 HTML" },
  { id: "baoyu-url-to-markdown",     label: "网页转 Markdown" },
  { id: "baoyu-youtube-transcript",  label: "YouTube 字幕" },
  { id: "vision-analysis",           label: "图像分析" },
  { id: "baoyu-compress-image",      label: "图片压缩" },
  { id: "minimax-multimodal-video",  label: "视频生成" },
  { id: "minimax-multimodal-audio",  label: "音频生成" },
  { id: "baoyu-post-to-wechat",      label: "发布公众号" },
  { id: "baoyu-post-to-weibo",       label: "发布微博" },
  { id: "baoyu-post-to-x",           label: "发布 X" },
  { id: "baoyu-danger-x-to-markdown", label: "推文转 Markdown" },
]

test.describe("功能广场", () => {
  test("首页加载 — 显示标题和分类 Tab", async ({ page }) => {
    await page.goto("/tools/plaza")
    await page.waitForLoadState("networkidle")
    await expect(page.getByText("功能广场")).toBeVisible()
    // 至少一个分类 Tab 可见（mock 返回 "图像创作"）
    await expect(page.getByText("图像创作")).toBeVisible()
  })

  for (const { id, label } of PLAZA_ROUTES) {
    test(`${label} (/tools/plaza/${id}) — 无白屏，有执行按钮`, async ({ page }) => {
      await page.goto(`/tools/plaza/${id}`)
      await page.waitForLoadState("networkidle")

      // 页面不能是空白（body 有内容）
      const bodyText = await page.locator("body").innerText()
      expect(bodyText.trim().length).toBeGreaterThan(0)

      // 不能出现 React 错误边界 / 白屏关键词
      await expect(page.getByText("Something went wrong")).not.toBeVisible()
      await expect(page.getByText("Cannot read properties")).not.toBeVisible()

      // 每个 PlazaSkillPage 都有「执行」按钮
      await expect(page.getByRole("button", { name: "执行" })).toBeVisible()
    })
  }
})
