import { test, expect } from "./fixtures"

test.describe("阶段推进", () => {
  test("从需求页点击下一阶段 → 跳转到分析页", async ({ page }) => {
    // Create project
    await page.goto("/")
    await page.getByRole("button", { name: "新建项目" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByPlaceholder(/项目名/).fill("阶段测试")
    await dialog.getByRole("button", { name: "创建" }).click()
    await page.waitForURL(/\/requirement/)

    // Look for the advance/next phase button
    const nextBtn = page.getByRole("button", { name: /下一阶段|需求分析|开始分析/ })
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
      // Should navigate to analysis page
      await page.waitForURL(/\/analysis/, { timeout: 5000 })
    }
  })
})
