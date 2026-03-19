# 产品分身预览 + 设计规范 Playground 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 产品分身展开后显示风格示例文字；设计规范展开后展示分组颜色 + 字体排版 + 组件预览 Playground。

**Architecture:** Rust 后端 `get_prd_style_content` 新增 `sample` 字段；前端 Persona.tsx 按优先级渲染 sample/profile/config；DesignSpec.tsx 新增 `parseColorGroups` / `parseTypography` / `extractPlaygroundTokens` 三个解析函数，驱动 Playground 区块全部使用 inline style，不污染 app 主题。

**Tech Stack:** Rust / Tauri v2、React / TypeScript、Tailwind CSS（仅布局）、inline style（Playground 组件）

---

### Task 1: Rust — PrdStyleContent 新增 sample 字段

**Files:**
- Modify: `app/src-tauri/src/commands/templates.rs`（PrdStyleContent struct + get_prd_style_content）

**Step 1: 修改 struct**

在 `app/src-tauri/src/commands/templates.rs` 第 121–127 行，将：
```rust
pub struct PrdStyleContent {
    pub config: String,
    pub profile: Option<String>,
    pub has_template: bool,
}
```
改为：
```rust
pub struct PrdStyleContent {
    pub config: String,
    pub profile: Option<String>,
    pub sample: Option<String>,
    pub has_template: bool,
}
```

**Step 2: 修改 get_prd_style_content 函数**

在 `get_prd_style_content` 函数里（现有第 138–142 行），将：
```rust
    let config = fs::read_to_string(style_dir.join("style-config.json"))
        .map_err(|e| e.to_string())?;
    let profile = fs::read_to_string(style_dir.join("style-profile.json")).ok();
    let has_template = style_dir.join("feishu-template.md").exists();
    Ok(PrdStyleContent { config, profile, has_template })
```
改为：
```rust
    let config = fs::read_to_string(style_dir.join("style-config.json"))
        .map_err(|e| e.to_string())?;
    let profile = fs::read_to_string(style_dir.join("style-profile.json")).ok();
    let sample = fs::read_to_string(style_dir.join("sample.md")).ok();
    let has_template = style_dir.join("feishu-template.md").exists();
    Ok(PrdStyleContent { config, profile, sample, has_template })
```

**Step 3: 编译验证**

```bash
~/.cargo/bin/cargo check --manifest-path app/src-tauri/Cargo.toml 2>&1 | tail -5
```
预期：`Finished` 无 error。

**Step 4: 提交**

```bash
git add app/src-tauri/src/commands/templates.rs
git commit -m "feat: add sample field to PrdStyleContent for persona preview"
```

---

### Task 2: TypeScript — PrdStyleContent 接口 + Persona.tsx 展示优先级

**Files:**
- Modify: `app/src/lib/tauri-api.ts`（PrdStyleContent 接口）
- Modify: `app/src/pages/tools/Persona.tsx`（展开区域渲染）

**Step 1: 更新 tauri-api.ts 接口**

找到（约第 105–109 行）：
```typescript
export interface PrdStyleContent {
  config: string
  profile: string | null
  hasTemplate: boolean
}
```
改为：
```typescript
export interface PrdStyleContent {
  config: string
  profile: string | null
  sample: string | null
  hasTemplate: boolean
}
```

**Step 2: 更新 Persona.tsx 展开内容渲染**

找到展开区域（约第 243–254 行）：
```tsx
                  {expandedStyles.has(s.name) && (
                    <div className="border-t border-[var(--border)] px-4 py-3">
                      {loadingContent.has(s.name) ? (
                        <p className="text-xs text-[var(--text-secondary)]">加载中···</p>
                      ) : styleContents[s.name] ? (
                        <PrdViewer
                          markdown={styleContents[s.name].profile ?? `\`\`\`json\n${styleContents[s.name].config}\n\`\`\``}
                          isStreaming={false}
                        />
                      ) : null}
                    </div>
                  )}
```
改为：
```tsx
                  {expandedStyles.has(s.name) && (
                    <div className="border-t border-[var(--border)] px-4 py-3">
                      {loadingContent.has(s.name) ? (
                        <p className="text-xs text-[var(--text-secondary)]">加载中···</p>
                      ) : styleContents[s.name] ? (() => {
                        const c = styleContents[s.name]
                        const markdown = c.sample ?? c.profile ?? `\`\`\`json\n${c.config}\n\`\`\``
                        const label = c.sample ? '风格示例' : c.profile ? '风格档案' : '风格配置'
                        return (
                          <div>
                            <p className="mb-2 text-[10px] text-[var(--text-tertiary)]">{label}</p>
                            <PrdViewer markdown={markdown} isStreaming={false} />
                          </div>
                        )
                      })() : null}
                    </div>
                  )}
```

**Step 3: TypeScript 类型检查**

```bash
cd app && node_modules/.bin/tsc --noEmit 2>&1 | head -20
```
预期：无输出（无错误）。

**Step 4: 提交**

```bash
git add app/src/lib/tauri-api.ts app/src/pages/tools/Persona.tsx
git commit -m "feat: show sample/profile/config with label in persona expand"
```

---

### Task 3: DesignSpec.tsx — Playground（颜色分组 + 字体 + 组件）

**Files:**
- Modify: `app/src/pages/tools/DesignSpec.tsx`（全部前端逻辑）

这是本次最大的任务。DesignSpec.tsx 现有约 170 行。改动分三部分：

#### Part A: 替换 parseColors，新增三个解析函数

将文件顶部现有的 `parseColors` 函数（第 8–18 行）**整体替换**为以下四个函数：

```typescript
// 将嵌套 color 对象打平，过滤出合法颜色值
function flattenColorObj(obj: unknown, prefix = ''): Array<{ name: string; value: string }> {
  if (typeof obj === 'string' && /^#[0-9a-fA-F]{3,8}$|^rgb/.test(obj)) {
    return [{ name: prefix, value: obj }]
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flattenColorObj(v, prefix ? `${prefix}.${k}` : k)
  )
}

// 按顶层分组返回颜色
function parseColorGroups(tokensRaw: string): Array<{ label: string; colors: Array<{ name: string; value: string }> }> {
  try {
    const tokens = JSON.parse(tokensRaw)
    const colors = tokens.colors ?? tokens.color ?? tokens.palette ?? {}
    if (typeof colors !== 'object' || colors === null) return []
    return Object.entries(colors as Record<string, unknown>)
      .map(([groupKey, groupVal]) => ({
        label: groupKey,
        colors: flattenColorObj(groupVal, ''),
      }))
      .filter(g => g.colors.length > 0)
  } catch { return [] }
}

// 提取字体字号列表
function parseTypography(tokensRaw: string): Array<{ label: string; size: string }> {
  try {
    const tokens = JSON.parse(tokensRaw)
    const typo = tokens.typography ?? {}
    const sizes: unknown =
      typo.sizes ?? typo.fontSize ?? typo.fontSizes ??
      tokens.fontSizes ?? tokens.fontSize ?? null
    if (!sizes || typeof sizes !== 'object') return []
    return Object.entries(sizes as Record<string, unknown>)
      .map(([k, v]) => ({ label: k, size: String(v) }))
      .filter(t => /\d/.test(t.size))
      .slice(0, 6) // 最多展示 6 个
  } catch { return [] }
}

// 提取 Playground 渲染用 token 值
function extractPlaygroundTokens(tokensRaw: string) {
  try {
    const tokens = JSON.parse(tokensRaw)
    const c = tokens.colors ?? tokens.color ?? tokens.palette ?? {}
    const primary   = c.primary?.main   ?? (typeof c.primary   === 'string' ? c.primary   : '#1D4ED8')
    const success   = c.semantic?.success ?? c.status?.success ?? c.success?.main ?? '#16a34a'
    const warning   = c.semantic?.warning ?? c.status?.warning ?? c.warning?.main ?? '#d97706'
    const error     = c.semantic?.error   ?? c.status?.error   ?? c.error?.main   ?? '#dc2626'
    const successBg = c.semantic?.successBg ?? '#f0fdf4'
    const warningBg = c.semantic?.warningBg ?? '#fffbeb'
    const errorBg   = c.semantic?.errorBg   ?? '#fef2f2'
    const radius = tokens.borderRadius?.md ?? tokens.radii?.md ?? tokens.radius?.md ?? '8px'
    const shadow = tokens.shadows?.md ?? tokens.shadow?.md ?? tokens.elevation?.md ?? '0 1px 8px rgba(0,0,0,0.08)'
    return { primary, success, warning, error, successBg, warningBg, errorBg, radius, shadow }
  } catch {
    return {
      primary: '#1D4ED8', success: '#16a34a', warning: '#d97706', error: '#dc2626',
      successBg: '#f0fdf4', warningBg: '#fffbeb', errorBg: '#fef2f2',
      radius: '8px', shadow: '0 1px 8px rgba(0,0,0,0.08)',
    }
  }
}
```

#### Part B: 更新展开内容渲染

找到现有展开区域（`{expandedSpecs.has(spec.name) && ...}`，约第 128–163 行），整体替换为：

```tsx
              {expandedSpecs.has(spec.name) && (
                <div className="border-t border-[var(--border)] px-4 py-4 space-y-5">
                  {loadingContent.has(spec.name) ? (
                    <p className="text-xs text-[var(--text-secondary)]">加载中···</p>
                  ) : specContents[spec.name] ? (() => {
                    const sc = specContents[spec.name]
                    const colorGroups = sc.tokensRaw ? parseColorGroups(sc.tokensRaw) : []
                    const typography = sc.tokensRaw ? parseTypography(sc.tokensRaw) : []
                    const pt = sc.tokensRaw ? extractPlaygroundTokens(sc.tokensRaw) : null

                    return (
                      <>
                        {/* README */}
                        {sc.readme && (
                          <PrdViewer markdown={sc.readme} isStreaming={false} />
                        )}

                        {/* 颜色系统（分组） */}
                        {colorGroups.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-[var(--text-tertiary)]">颜色系统</p>
                            <div className="space-y-2">
                              {colorGroups.map(group => (
                                <div key={group.label}>
                                  <p className="mb-1 text-[10px] text-[var(--text-tertiary)] capitalize">{group.label}</p>
                                  <div className="flex flex-wrap gap-2">
                                    {group.colors.map(c => (
                                      <div key={c.name} className="flex items-center gap-1.5">
                                        <span
                                          className="size-4 rounded-sm border border-[var(--border)] shrink-0"
                                          style={{ backgroundColor: c.value }}
                                          title={c.value}
                                        />
                                        <span className="text-[10px] text-[var(--text-secondary)]">{c.name || c.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 字体排版 */}
                        {typography.length > 0 && pt && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-[var(--text-tertiary)]">字体排版</p>
                            <div className="space-y-1">
                              {typography.map(t => (
                                <div key={t.label} className="flex items-baseline gap-3">
                                  <span
                                    style={{ fontSize: t.size, color: pt.primary, lineHeight: 1.3 }}
                                  >
                                    这是{t.label}文字
                                  </span>
                                  <span className="text-[10px] text-[var(--text-tertiary)]">{t.size}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 组件 Playground */}
                        {pt && (
                          <div>
                            <p className="mb-3 text-xs font-medium text-[var(--text-tertiary)]">组件预览</p>
                            <div className="space-y-3">
                              {/* 按钮 */}
                              <div className="flex flex-wrap gap-2">
                                <button style={{
                                  background: pt.primary, color: '#fff', border: 'none',
                                  borderRadius: pt.radius, padding: '7px 16px', fontSize: 13,
                                  cursor: 'default', fontWeight: 500,
                                }}>主要按钮</button>
                                <button style={{
                                  background: 'transparent', color: pt.primary,
                                  border: `1.5px solid ${pt.primary}`,
                                  borderRadius: pt.radius, padding: '6px 16px', fontSize: 13,
                                  cursor: 'default',
                                }}>次要按钮</button>
                                <button style={{
                                  background: pt.error, color: '#fff', border: 'none',
                                  borderRadius: pt.radius, padding: '7px 16px', fontSize: 13,
                                  cursor: 'default', fontWeight: 500,
                                }}>危险操作</button>
                              </div>

                              {/* 输入框 */}
                              <input
                                readOnly
                                placeholder="输入框示例..."
                                style={{
                                  border: `1.5px solid #d1d5db`,
                                  borderRadius: pt.radius, padding: '7px 12px',
                                  fontSize: 13, outline: 'none',
                                  width: '100%', maxWidth: 280,
                                  background: '#fff', color: '#374151',
                                }}
                              />

                              {/* 状态徽章 */}
                              <div className="flex flex-wrap gap-2">
                                {([
                                  { label: '成功', bg: pt.successBg, color: pt.success },
                                  { label: '警告', bg: pt.warningBg, color: pt.warning },
                                  { label: '错误', bg: pt.errorBg,   color: pt.error   },
                                ] as const).map(b => (
                                  <span key={b.label} style={{
                                    background: b.bg, color: b.color,
                                    borderRadius: 99, padding: '3px 10px',
                                    fontSize: 12, fontWeight: 500,
                                  }}>{b.label}</span>
                                ))}
                              </div>

                              {/* 卡片 */}
                              <div style={{
                                background: '#fff',
                                borderRadius: pt.radius,
                                boxShadow: pt.shadow,
                                padding: '12px 16px',
                                maxWidth: 280,
                              }}>
                                <p style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 4 }}>卡片标题</p>
                                <p style={{ fontSize: 12, color: '#6b7280' }}>这是卡片内容区域，展示圆角和阴影效果。</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {!sc.readme && colorGroups.length === 0 && (
                          <p className="text-xs text-[var(--text-tertiary)]">暂无可展示内容</p>
                        )}
                      </>
                    )
                  })() : null}
                </div>
              )}
```

**Step 3: TypeScript 类型检查**

```bash
cd app && node_modules/.bin/tsc --noEmit 2>&1 | head -20
```
预期：无输出。

**Step 4: 提交**

```bash
git add app/src/pages/tools/DesignSpec.tsx
git commit -m "feat: design spec playground with grouped colors, typography and component preview"
```

---

### Task 4: 重新编译 Rust 二进制并验证

由于 Task 1 修改了 Rust 代码，需要重新编译让运行中的 app 获取新的 `sample` 字段。

**Step 1: 编译**

```bash
~/.cargo/bin/cargo build --manifest-path app/src-tauri/Cargo.toml 2>&1 | tail -3
```
预期：`Finished`。

**Step 2: 替换运行中的二进制**

```bash
# 找到运行中的 ai-pm 进程并杀掉
pkill -f "target/debug/ai-pm" 2>/dev/null || true
sleep 1
# 启动新二进制（Vite dev server 已在 :1420 运行）
/Users/xiaowu/workplace/AI_PM/app/src-tauri/target/debug/ai-pm &
```

**Step 3: 验证**

打开 app → 工具 → 产品分身 → 展开某个分身卡片：
- 若目录有 `sample.md`：显示"风格示例"标签 + Markdown 内容
- 若只有 `style-profile.json`：显示"风格档案"
- 若都没有：显示"风格配置" + JSON 代码块

打开 工具 → 设计规范 → 展开某个规范：
- 颜色按 primary / secondary / semantic 分组显示
- 若有 typography token：显示字体排版示例
- 组件 Playground：主要按钮（品牌色）、次要按钮、危险操作按钮、输入框、状态徽章、卡片

**Step 4: 提交（如有遗漏文件）**

```bash
git add -A && git status  # 确认无遗漏
```
