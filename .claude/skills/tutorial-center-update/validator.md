# 教程中心 HTML 验证器

## 验证流程

### 阶段 1: 静态检查

```bash
#!/bin/bash
# validate-html.sh

HTML_FILE="AI_PM_教程中心.html"
ERRORS=0

echo "=== 教程中心 HTML 验证 ==="
echo ""

# 1. 文件存在检查
if [ ! -f "$HTML_FILE" ]; then
    echo "❌ 文件不存在: $HTML_FILE"
    exit 1
fi
echo "✓ 文件存在"

# 2. 零依赖检查
echo ""
echo "🔗 零依赖检查"

DEP_CHECKS=(
    "无Vue:!vue.global.js"
    "无React:!react"
    "无Angular:!angular"
    "无CDN依赖:!unpkg.com"
    "无外部JS:!cdnjs.cloudflare.com"
)

for check in "${DEP_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check"
    if ! grep -q "$pattern" "$HTML_FILE"; then
        echo "✓ $name"
    else
        echo "❌ $name"
        ERRORS=$((ERRORS+1))
    fi
done

# 3. 原生 JS 检查
echo ""
echo "🔧 原生 JS 检查"

JS_CHECKS=(
    "IIFE封装:(function()"
    "严格模式:use strict"
    "switchTab:switchTab"
    "IntersectionObserver:IntersectionObserver"
    "键盘导航:ArrowRight"
    "触摸支持:touchstart"
)

for check in "${JS_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check"
    if grep -q "$pattern" "$HTML_FILE"; then
        echo "✓ $name"
    else
        echo "❌ $name"
        ERRORS=$((ERRORS+1))
    fi
done

# 4. Tab 系统检查
echo ""
echo "📑 Tab 系统检查"

TAB_CHECKS=(
    "导航栏:nav-tab"
    "Tab面板:tab-panel"
    "进度条:progress-bar"
    "主题色切换:--accent"
    "5个Tab:data-tab=\"4\""
)

for check in "${TAB_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check"
    if grep -q "$pattern" "$HTML_FILE"; then
        echo "✓ $name"
    else
        echo "❌ $name"
        ERRORS=$((ERRORS+1))
    fi
done

# 5. CSS 动画检查
echo ""
echo "✨ CSS 动画检查"

CSS_CHECKS=(
    "Scroll Reveal:.reveal"
    "visible类:.visible"
    "CSS变量::root"
    "过渡动画:transition"
    "transform:transform"
)

for check in "${CSS_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check"
    if grep -q "$pattern" "$HTML_FILE"; then
        echo "✓ $name"
    else
        echo "❌ $name"
        ERRORS=$((ERRORS+1))
    fi
done

# 6. 本地文件引用检查
echo ""
echo "📁 本地文件引用检查"
if grep -qE 'src="\./|href="\./|src="/[^/]|href="/[^/]' "$HTML_FILE"; then
    echo "❌ 发现本地文件引用"
    ERRORS=$((ERRORS+1))
else
    echo "✓ 无本地文件引用"
fi

# 7. 无障碍检查
echo ""
echo "♿ 无障碍检查"

A11Y_CHECKS=(
    "role=tab:role=\"tab\""
    "aria-selected:aria-selected"
    "noscript:noscript"
)

for check in "${A11Y_CHECKS[@]}"; do
    IFS=':' read -r name pattern <<< "$check"
    if grep -q "$pattern" "$HTML_FILE"; then
        echo "✓ $name"
    else
        echo "⚠ $name (建议添加)"
    fi
done

# 8. 文件大小检查
echo ""
echo "📏 文件大小检查"
SIZE=$(wc -c < "$HTML_FILE")
SIZE_KB=$((SIZE / 1024))
if [ $SIZE -gt 512000 ]; then
    echo "⚠ 文件较大: $SIZE_KB KB"
else
    echo "✓ 文件大小: $SIZE_KB KB"
fi

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "=== ✅ 所有检查通过 ==="
    exit 0
else
    echo "=== ❌ 发现 $ERRORS 个错误 ==="
    exit 1
fi
```

### 阶段 2: 运行时检查

```javascript
// 在浏览器控制台运行
const selfCheck = {
    run() {
        const results = [];

        // 检查零依赖
        results.push({
            name: '零依赖',
            pass: typeof Vue === 'undefined' && typeof React === 'undefined',
            error: '检测到框架依赖'
        });

        // 检查 Tab 系统
        results.push({
            name: 'Tab系统',
            pass: document.querySelectorAll('.nav-tab').length === 5,
            count: document.querySelectorAll('.nav-tab').length
        });

        // 检查 switchTab
        results.push({
            name: 'switchTab函数',
            pass: typeof switchTab === 'function'
        });

        // 检查 Scroll Reveal
        results.push({
            name: 'Scroll Reveal',
            pass: document.querySelectorAll('.reveal').length > 0,
            count: document.querySelectorAll('.reveal').length
        });

        // 检查进度条
        results.push({
            name: '进度条',
            pass: document.getElementById('progressBar') !== null
        });

        // 输出结果
        console.log('=== 运行时自检 ===');
        results.forEach(r => {
            console.log(r.pass ? '✓' : '❌', r.name, r.count ? `(${r.count})` : '', r.error || '');
        });

        return results.every(r => r.pass);
    }
};

// 运行自检
selfCheck.run();
```

### 阶段 3: 浏览器自动化测试

```javascript
// 使用 Playwright MCP 进行端到端测试
const tests = [
    {
        name: '页面加载',
        run: async (page) => {
            await page.goto('file://' + process.cwd() + '/AI_PM_教程中心.html');
            return await page.locator('.nav').isVisible();
        }
    },
    {
        name: 'Tab切换',
        run: async (page) => {
            await page.click('text=技能');
            return await page.locator('.tab-panel.active').count() === 1;
        }
    },
    {
        name: '键盘导航',
        run: async (page) => {
            await page.keyboard.press('ArrowRight');
            await page.waitForTimeout(300);
            return await page.locator('.nav-tab.active').getAttribute('data-tab') === '1';
        }
    },
    {
        name: '进度条',
        run: async (page) => {
            await page.evaluate(() => window.scrollTo(0, 500));
            const transform = await page.locator('.progress-bar').evaluate(el => el.style.transform);
            return transform.includes('scaleX');
        }
    },
    {
        name: '零依赖验证',
        run: async (page) => {
            return await page.evaluate(() => {
                return typeof Vue === 'undefined' &&
                       typeof React === 'undefined' &&
                       typeof angular === 'undefined';
            });
        }
    }
];
```

## 验证报告格式

```markdown
## 验证报告 - 2026-03-03

### 静态检查
| 项目 | 状态 |
|------|------|
| 文件存在 | ✅ |
| 无Vue | ✅ |
| 无React | ✅ |
| 无CDN | ✅ |
| IIFE封装 | ✅ |
| switchTab | ✅ |
| IntersectionObserver | ✅ |
| 键盘导航 | ✅ |
| 触摸支持 | ✅ |
| 5个Tab | ✅ |
| Scroll Reveal | ✅ |
| 进度条 | ✅ |
| 无障碍属性 | ✅ |

### 运行时检查
| 项目 | 状态 |
|------|------|
| 零依赖验证 | ✅ |
| Tab系统 | ✅ (5个) |
| switchTab函数 | ✅ |
| Scroll Reveal | ✅ |
| 进度条 | ✅ |

### 结论
✅ 所有检查通过，HTML 文件完全独立，零依赖，可离线运行
```
