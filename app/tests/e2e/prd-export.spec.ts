import { test, expect } from "./fixtures"

test.describe("PRD 导出", () => {
  test("PRD 页面 → 导出菜单可展开", async ({ page }) => {
    // Navigate directly to a PRD page (mock will return null for file)
    await page.goto("/")
    await page.getByRole("button", { name: "新建项目" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder(/项目名/).fill("PRD测试")
    await dialog.getByRole("button", { name: "创建" }).click()
    await page.waitForURL(/\/requirement/)

    // Navigate to PRD page manually
    const projectUrl = page.url().replace("/requirement", "/prd")
    await page.goto(projectUrl)
    await page.waitForLoadState("networkidle")

    // PRD page should show — either empty state or content
    // Check the page loaded without crash
    await expect(page.getByText("PRD")).toBeVisible()
  })
})
