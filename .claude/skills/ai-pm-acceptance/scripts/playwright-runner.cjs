// Playwright 验收工具带（通用·零产品特定）。供项目侧 _runner/ 里 require 用。
// 这三件是每个产品验收都要用、又最容易踩坑的，封装好换产品直接用——选择器全作参数传，不焊死任何产品。
//
//   const { connectAndFind, waitComplete, reproduce } = require('<skill>/scripts/playwright-runner.cjs');
//   const { browser, page, frame } = await connectAndFind(9223, 'sub-app-url-substr');
//   await frame.fill('<你这个产品的输入框选择器>', '问题');
//   await frame.click('<你这个产品的发送选择器>');
//   await waitComplete(page, frame, '<你这个产品的输入框选择器>');   // 等 AI 真答完
//   const dist = await reproduce(3, async () => { /* 跑一遍、返回这次结果 */ });  // 复现看分布
//
// 底层用 Playwright 连「你已登录的真实浏览器」（过 SSO 唯一可行法）。start-browser.sh 负责把那个浏览器开好。

const path = require("path");

// 找 playwright-core：环境变量 > node 解析 > 常见本机缓存。找不到给友好提示。
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_CORE, "playwright-core"].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (_) {} }
  // 再从 cwd / cwd/app / 本脚本目录 的 node_modules 找——playwright-core 常装在项目的 app 子目录下，
  // 不在 skill 脚本的目录链上，标准 require 找不到。
  const searchPaths = [process.cwd(), path.join(process.cwd(), "app"), __dirname];
  try { return require(require.resolve("playwright-core", { paths: searchPaths })); } catch (_) {}
  throw new Error(
    "找不到 playwright-core。装一下 `npm i playwright-core`，或设环境变量 PLAYWRIGHT_CORE 指向它的路径，" +
    "或在含它的项目目录（如有 app/node_modules/playwright-core 的 repo 根）下跑。"
  );
}
const { chromium } = loadPlaywright();

// ① 连上你登录好的浏览器，并定位到目标 frame（很多产品 AI 嵌在子应用 iframe 里）。
//    frameSubstr 留空则用主页面。返回 { browser, page, frame }。
async function connectAndFind(port = 9223, frameSubstr = "") {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page = null;
  for (const ctx of browser.contexts())
    for (const p of ctx.pages()) { if (!page) page = p; }
  if (!page) throw new Error(`端口 ${port} 上没找到打开的页面——浏览器开了吗？登录页加载出来了吗？`);
  let frame = page;
  if (frameSubstr) {
    const f = page.frames().find((fr) => fr.url().includes(frameSubstr));
    if (f) frame = f;
  }
  return { browser, page, frame };
}

// ② 等 AI 真答完：靠「忙碌信号」（输入框响应中被禁用 → 答完恢复可输入），不靠文字停没停
//    （文字会被「正在思考中…」这类静态占位骗）。inputSelector = 你这个产品的输入框选择器。
async function waitComplete(page, frame, inputSelector, maxWait = 180000) {
  const t0 = Date.now();
  try { await frame.waitForSelector(`${inputSelector}[disabled]`, { timeout: 12000 }); } catch (_) {}  // 等响应开始
  while (Date.now() - t0 < maxWait) {
    const enabled = await frame.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el && !el.disabled;
    }, inputSelector);
    if (enabled && Date.now() - t0 > 4000) return { done: true, elapsedMs: Date.now() - t0 };
    await page.waitForTimeout(2500);
  }
  return { done: false, elapsedMs: Date.now() - t0, timedout: true };
}

// ③ 复现 N 次看分布：跑 fn n 遍，收集每次结果（命门——单次是假设、判定看分布 3/3、1/4）。
//    fn 应自己做好隔离（如每次新建会话），并返回这次的判定（如 {hit:true} / 任意结构）。
async function reproduce(n, fn) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    try { runs.push({ i, ok: true, result: await fn(i) }); }
    catch (e) { runs.push({ i, ok: false, error: e.message }); }
  }
  return runs;  // 调用方据此统计 X/N，别只看某一次
}

module.exports = { connectAndFind, waitComplete, reproduce, chromium };
