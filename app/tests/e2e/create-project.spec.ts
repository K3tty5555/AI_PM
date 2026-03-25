import { test, expect } from "./fixtures"

test.describe("创建项目", () => {
  test("Dashboard 新建项目 → 输入名称 → 创建成功 → 跳转到需求页", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Empty state — click "新建项目" button
    await page.getByRole("button", { name: "新建项目" }).click()

    // Dialog should appear
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    // Type project name
    const input = dialog.getByPlaceholder(/项目名/)
    await input.fill("测试产品")

    // Click create
    await dialog.getByRole("button", { name: "创建" }).click()

    // Should navigate to requirement page
    await page.waitForURL(/\/project\/mock-\d+\/requirement/)
    await expect(page).toHaveURL(/\/requirement/)
  })

  test("Dashboard 显示已创建的项目卡片", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Create a project first
    await page.getByRole("button", { name: "新建项目" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder(/项目名/).fill("我的项目")
    await dialog.getByRole("button", { name: "创建" }).click()
    await page.waitForURL(/\/requirement/)

    // Go back to dashboard
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Should see the project card
    await expect(page.getByText("我的项目")).toBeVisible()
  })
})
