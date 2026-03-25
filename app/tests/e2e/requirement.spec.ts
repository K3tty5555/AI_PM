import { test, expect } from "./fixtures"

test.describe("需求填写", () => {
  test("需求页面加载 → 显示输入区域", async ({ page }) => {
    // Create project first
    await page.goto("/")
    await page.getByRole("button", { name: "新建项目" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder(/项目名/).fill("需求测试")
    await dialog.getByRole("button", { name: "创建" }).click()
    await page.waitForURL(/\/requirement/)

    // Should show the requirement page heading
    await expect(page.getByText("需求描述")).toBeVisible()
  })
})
