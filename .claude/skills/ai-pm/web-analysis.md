# 网页分析与 Playwright MCP 调用指引

本文件是 ai-pm 主技能的子模块，负责参考网页抓取和内容分析。当用户输入 `/ai-pm [URL]` 或在竞品研究阶段需要抓取网页时，遵循以下规范。

---

## 何时使用

- 用户直接输入 URL，要求分析参考页面
- Phase 0（参考资源收集）中需要抓取网页内容
- Phase 2+3（竞品研究）中需要抓取竞品官网

---

## Playwright MCP 调用策略

### 批量抓取模式（同会话复用）

多个页面需要抓取时，在同一个 Playwright 会话中完成所有页面的访问：
1. 先用 `browser_navigate` 打开第一个页面
2. 用 `browser_snapshot` 获取页面内容
3. 直接 `browser_navigate` 到下一个页面（不关闭浏览器）
4. 重复直到所有页面抓取完毕

这样比每个页面单独启动 Playwright 会话快 3-5 倍。

### 重试与超时

- 单页面抓取超时设置：30 秒
- 超时后自动重试一次（共 2 次尝试）
- 仍失败则降级为 `WebFetch`（纯 HTTP GET + HTML 标签剥离）并继续
- 不因单个页面失败而中断整个分析流程

### 降级策略（Playwright MCP 不可用时）

如果 Playwright MCP 不可用（未安装或连接失败）：
1. 自动降级为 `WebFetch` 命令（纯 HTTP GET + HTML 标签剥离）
2. 向用户明确提示："已降级为纯文本抓取。JS 渲染内容（如 SPA 页面）可能无法正确获取，分析结果可能不完整。"
3. 继续执行分析流程，基于纯文本内容完成后续工作

---

## 抓取内容处理

抓取到的网页内容按以下方式处理：

- **参考资源（Phase 0）**：提取关键信息，存入 `07-references/` 目录
- **竞品官网（Phase 2+3）**：提取产品功能、定价、用户评价等维度信息，写入竞品分析报告
- **用户指定 URL**：分析页面内容，总结核心信息并展示给用户

---

## 注意事项

- Playwright MCP 配置为 headless Chromium（后台无界面运行），无需启动本地 HTTP 服务器
- 查看本地 HTML 文件直接用 `file:///绝对路径/文件名.html`，不需要 `python3 -m http.server`
- 截图/DOM 验证优先用 `browser_run_code` + `page.evaluate()` 而非 `browser_take_screenshot`（后者等待字体加载易超时）
