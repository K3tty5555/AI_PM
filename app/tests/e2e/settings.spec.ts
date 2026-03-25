import { test, expect } from "./fixtures"

test.describe("设置页面", () => {
  test("Settings 页面加载 → 3 个 Tab 可切换", async ({ page }) => {
    await page.goto("/settings")
    await page.waitForLoadState("networkidle")

    // Should show settings tabs
    await expect(page.getByText("API 配置")).toBeVisible()
    await expect(page.getByText("项目管理")).toBeVisible()
    await expect(page.getByText("关于")).toBeVisible()
  })

  test("切换到项目管理 Tab → 显示项目目录配置", async ({ page }) => {
    await page.goto("/settings?tab=project")
    await page.waitForLoadState("networkidle")

    // Click project tab
    await page.getByText("项目管理").click()

    // Should show project directory config
    await expect(page.getByText("项目目录")).toBeVisible()
  })

  test("切换到关于 Tab → 显示版本信息", async ({ page }) => {
    await page.goto("/settings")
    await page.waitForLoadState("networkidle")

    // Click about tab
    await page.getByText("关于").click()

    // Should show version or about section
    await expect(page.getByText(/版本|更新/)).toBeVisible()
  })
})
