# 知识库自动沉淀与智能推荐 — 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现项目完成后自动沉淀知识、PRD 前推荐相关知识、评审前提醒踩坑经验。

**Architecture:** Rust 后端新增 2 个 Tauri command（`recommend_knowledge` 纯规则匹配 + `extract_knowledge_candidates` 非流式 AI 调用），前端在 Retrospective/Prd/Review 页面集成对应 UI。先修复知识库路径不一致的现有 bug。

**Tech Stack:** Rust (Tauri v2, reqwest, serde_json, tokio) + React (TypeScript)

---

## Task 1: 修复知识库路径不一致 (P0)

**Files:**
- Modify: `app/src-tauri/src/commands/stream.rs` — `load_knowledge` 函数 (行 128-183)

**问题:** `load_knowledge` 读取 `{config_dir}/knowledge/`（即 `~/.config/ai-pm/knowledge/`），但知识库 CRUD 操作的是 `{templates_base}/knowledge-base/`（即 `~/Documents/AI PM/templates/knowledge-base/`）。UI 添加的知识没有被注入 AI prompt。

**Step 1: 修改 `load_knowledge` 的签名和路径**

当前签名：
```rust
fn load_knowledge(config_dir: &str) -> String {
    let kb_root = std::path::Path::new(config_dir).join("knowledge");
```

改为接收 `projects_dir`，使用 `templates/knowledge-base/`：
```rust
fn load_knowledge(projects_dir: &str) -> String {
    let kb_root = std::path::Path::new(projects_dir).join("templates").join("knowledge-base");
```

**Step 2: 更新 `build_system_prompt` 中的调用处**

在 `build_system_prompt` 中找到 `load_knowledge(config_dir)` 调用（约行 259），改为 `load_knowledge(projects_dir)`。同时确保 `projects_dir` 参数已传入 `build_system_prompt`（检查函数签名，如已有 `projects_dir` 参数则直接用，否则需要从 `state.projects_dir` 传入）。

**Step 3: 验证**

运行 `cargo check --manifest-path app/src-tauri/Cargo.toml`，确保编译通过。

**Step 4: 提交**

```bash
git add app/src-tauri/src/commands/stream.rs
git commit -m "fix: unify knowledge base path to templates/knowledge-base"
```

---

## Task 2: 后端实现 `recommend_knowledge` (P2)

**Files:**
- Modify: `app/src-tauri/src/commands/knowledge.rs` — 新增函数
- Modify: `app/src-tauri/src/lib.rs` — 注册命令 (行 185-189)

**Step 1: 新增参数结构体和命令**

在 `knowledge.rs` 末尾新增：

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendKnowledgeArgs {
    pub project_id: String,
    pub timing: String, // "before_prd" | "before_review"
}

#[tauri::command]
pub fn recommend_knowledge(
    state: State<'_, AppState>,
    args: RecommendKnowledgeArgs,
) -> Vec<KnowledgeEntry> {
    // 1. 读取需求分析报告，提取关键词
    let project_dir = find_project_output_dir(&state, &args.project_id);
    let keywords = extract_keywords_from_analysis(&project_dir);
    if keywords.is_empty() {
        return Vec::new(); // 优雅降级
    }

    // 2. 加载所有知识条目
    let all_entries = list_knowledge_internal(&state);

    // 3. 计算相关度并排序
    let mut scored: Vec<(f32, KnowledgeEntry)> = all_entries
        .into_iter()
        .filter_map(|entry| {
            let score = calculate_relevance(&entry, &keywords, &args.timing);
            if score > 0.0 { Some((score, entry)) } else { None }
        })
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.into_iter().take(10).map(|(_, e)| e).collect()
}
```

**Step 2: 实现辅助函数**

在同一文件中新增：

```rust
/// 从需求分析报告中提取关键词（标题 + 各级 heading）
fn extract_keywords_from_analysis(project_dir: &Option<String>) -> Vec<String> {
    let Some(dir) = project_dir else { return Vec::new() };
    let analysis_path = std::path::Path::new(dir).join("02-analysis-report.md");
    let Ok(content) = fs::read_to_string(&analysis_path) else { return Vec::new() };

    content
        .lines()
        .filter(|line| line.starts_with('#'))
        .map(|line| line.trim_start_matches('#').trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// 计算知识条目与关键词的相关度分数
fn calculate_relevance(entry: &KnowledgeEntry, keywords: &[String], timing: &str) -> f32 {
    let title_lower = entry.title.to_lowercase();
    let content_lower = entry.content.to_lowercase();

    let mut score: f32 = 0.0;
    for kw in keywords {
        let kw_lower = kw.to_lowercase();
        if title_lower.contains(&kw_lower) { score += 3.0; }
        if content_lower.contains(&kw_lower) { score += 1.0; }
    }

    // before_review 时 pitfalls 和 decisions 加权
    if timing == "before_review"
        && (entry.category == "pitfalls" || entry.category == "decisions")
    {
        score *= 2.0;
    }

    score
}

/// 查找项目输出目录
fn find_project_output_dir(state: &State<'_, AppState>, project_id: &str) -> Option<String> {
    let db = state.db.lock().unwrap();
    db.query_row(
        "SELECT output_dir FROM projects WHERE id = ?1",
        [project_id],
        |row| row.get::<_, String>(0),
    ).ok()
}

/// 内部版 list_knowledge（不需要 State 包装）
fn list_knowledge_internal(state: &State<'_, AppState>) -> Vec<KnowledgeEntry> {
    let kb_root = state.templates_base().join("knowledge-base");
    let mut entries = Vec::new();
    for category in CATEGORIES {
        let cat_dir = kb_root.join(category);
        if !cat_dir.exists() { continue; }
        let Ok(dir) = fs::read_dir(&cat_dir) else { continue; };
        for file in dir.filter_map(|e| e.ok()) {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") { continue; }
            let Ok(content) = fs::read_to_string(&path) else { continue; };
            let id = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let title = content.lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l[2..].trim().to_string())
                .unwrap_or_else(|| id.clone());
            entries.push(KnowledgeEntry { id, category: category.to_string(), title, content });
        }
    }
    entries
}
```

**Step 3: 注册命令**

在 `lib.rs` 的 `invoke_handler` 中，`commands::knowledge::get_knowledge_content` 后面添加：
```rust
commands::knowledge::recommend_knowledge,
```

**Step 4: 验证编译**

```bash
cargo check --manifest-path app/src-tauri/Cargo.toml
```

**Step 5: 提交**

```bash
git add app/src-tauri/src/commands/knowledge.rs app/src-tauri/src/lib.rs
git commit -m "feat: add recommend_knowledge command with rule-based matching"
```

---

## Task 3: 后端实现 `extract_knowledge_candidates` (P1)

**Files:**
- Modify: `app/src-tauri/src/commands/knowledge.rs` — 新增函数
- Modify: `app/src-tauri/src/lib.rs` — 注册命令
- Modify: `app/src-tauri/Cargo.toml` — 确认 reqwest 依赖

**Step 1: 新增数据结构**

在 `knowledge.rs` 顶部新增：

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCandidate {
    pub category: String,
    pub title: String,
    pub content: String,
    pub source: String,
}
```

**Step 2: 实现非流式 AI 调用函数**

```rust
/// 从项目产出物中用 AI 提取可沉淀的候选知识点
#[tauri::command]
pub async fn extract_knowledge_candidates(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<KnowledgeCandidate>, String> {
    let output_dir = find_project_output_dir(&State::clone(&state), &project_id)
        .ok_or_else(|| "找不到项目输出目录".to_string())?;

    let dir = std::path::Path::new(&output_dir);

    // 1. 读取产出物（PRD 必须存在）
    let prd = read_file_if_exists(&dir.join("05-prd").join("05-PRD-v1.0.md"))
        .or_else(|| read_file_if_exists(&dir.join("05-PRD-v1.0.md")))
        .ok_or_else(|| "PRD 未完成，请先完成 PRD 生成".to_string())?;

    let review = read_file_if_exists(&dir.join("08-review-report.md")).unwrap_or_default();
    let retro = read_file_if_exists(&dir.join("10-retrospective.md")).unwrap_or_default();

    // 2. 构建 prompt
    let mut context = format!("## PRD\n\n{}\n\n", truncate_to_chars(&prd, 6000));
    if !review.is_empty() {
        context.push_str(&format!("## 评审报告\n\n{}\n\n", truncate_to_chars(&review, 4000)));
    }
    if !retro.is_empty() {
        context.push_str(&format!("## 复盘总结\n\n{}\n\n", truncate_to_chars(&retro, 3000)));
    }

    let prompt = format!(
        r#"你是一位产品知识管理专家。请分析以下项目产出物，提取 3-5 条值得沉淀的经验知识。

每条知识必须包含：
- category: 分类，只能是 patterns(最佳模式) / decisions(决策记录) / pitfalls(踩坑经验) / metrics(指标设计) / playbooks(打法手册) / insights(产品洞察) 之一
- title: 简短标题（10-20字）
- content: 具体内容（50-150字，包含背景、结论、适用场景）
- source: 提取来源，只能是 "PRD" / "评审报告" / "复盘总结" 之一

请直接输出 JSON 数组，不要输出任何其他内容：

{context}"#
    );

    // 3. 调用 AI（读取配置决定用 API 还是 CLI）
    let config_path = std::path::Path::new(&state.config_dir).join("config.json");
    let raw_text = call_ai_non_streaming(&config_path, &prompt).await?;

    // 4. 解析 JSON（容错）
    parse_candidates_json(&raw_text)
}
```

**Step 3: 实现辅助函数**

```rust
fn read_file_if_exists(path: &std::path::Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

fn truncate_to_chars(s: &str, max: usize) -> &str {
    if s.len() <= max { return s; }
    // 找到 max 附近的 char boundary
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) { end -= 1; }
    &s[..end]
}

fn parse_candidates_json(raw: &str) -> Result<Vec<KnowledgeCandidate>, String> {
    let trimmed = raw.trim();

    // 尝试直接解析
    if let Ok(candidates) = serde_json::from_str::<Vec<KnowledgeCandidate>>(trimmed) {
        return Ok(candidates);
    }

    // 容错：提取 [ ... ] 区间
    if let (Some(start), Some(end)) = (trimmed.find('['), trimmed.rfind(']')) {
        let slice = &trimmed[start..=end];
        if let Ok(candidates) = serde_json::from_str::<Vec<KnowledgeCandidate>>(slice) {
            return Ok(candidates);
        }
    }

    Err(format!("AI 返回的内容无法解析为知识点列表：{}", &trimmed[..trimmed.len().min(200)]))
}
```

**Step 4: 实现非流式 AI 调用**

```rust
/// 非流式 AI 调用，根据配置选择 API 或 CLI
async fn call_ai_non_streaming(
    config_path: &std::path::Path,
    prompt: &str,
) -> Result<String, String> {
    // 读取配置
    let config_raw = fs::read_to_string(config_path)
        .map_err(|_| "无法读取配置文件，请先在设置中配置 API".to_string())?;
    let config: serde_json::Value = serde_json::from_str(&config_raw)
        .map_err(|_| "配置文件格式错误".to_string())?;

    let backend = config["backend"].as_str().unwrap_or("api");

    if backend == "claude_cli" {
        // CLI 模式
        call_ai_via_cli(prompt).await
    } else {
        // API 模式
        let api_key = config["apiKey"].as_str().unwrap_or_default();
        let base_url = config["baseUrl"].as_str().unwrap_or("https://api.anthropic.com");
        let model = config["model"].as_str().unwrap_or("claude-sonnet-4-6");

        if api_key.is_empty() {
            return Err("API Key 未配置".to_string());
        }
        call_ai_via_api(api_key, base_url, model, prompt).await
    }
}

/// API 模式非流式调用
async fn call_ai_via_api(
    api_key: &str,
    base_url: &str,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));
    let is_anthropic = base_url.contains("anthropic.com") || model.starts_with("claude-");

    let body = if is_anthropic {
        serde_json::json!({
            "model": model,
            "max_tokens": 2048,
            "stream": false,
            "messages": [{"role": "user", "content": prompt}]
        })
    } else {
        // OpenAI 兼容格式
        serde_json::json!({
            "model": model,
            "max_tokens": 2048,
            "stream": false,
            "messages": [{"role": "user", "content": prompt}]
        })
    };

    let client = reqwest::Client::new();
    let mut req = client.post(&url).json(&body);

    if is_anthropic {
        req = req
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01");
    } else {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req.send().await.map_err(|e| format!("API 请求失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;

    if !status.is_success() {
        return Err(format!("API 返回错误 {status}: {}", &text[..text.len().min(300)]));
    }

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("解析响应 JSON 失败: {e}"))?;

    // Anthropic 格式
    if let Some(content) = json["content"].as_array() {
        if let Some(first) = content.first() {
            if let Some(text) = first["text"].as_str() {
                return Ok(text.to_string());
            }
        }
    }
    // OpenAI 兼容格式
    if let Some(text) = json["choices"][0]["message"]["content"].as_str() {
        return Ok(text.to_string());
    }

    Err("无法从 API 响应中提取文本".to_string())
}

/// CLI 模式调用
async fn call_ai_via_cli(prompt: &str) -> Result<String, String> {
    use crate::providers::claude_cli::resolve_claude_binary;
    use crate::providers::claude_cli::enriched_path;
    use tokio::io::AsyncWriteExt;

    let mut child = tokio::process::Command::new(resolve_claude_binary())
        .arg("--print")
        .arg("--dangerously-skip-permissions")
        .env_remove("CLAUDECODE")
        .env("PATH", enriched_path())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 claude: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(prompt.as_bytes()).await
            .map_err(|e| format!("写入 stdin 失败: {e}"))?;
    }

    let output = child.wait_with_output().await
        .map_err(|e| format!("等待 claude 完成失败: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("claude 执行出错: {}", stderr.chars().take(300).collect::<String>()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

**Step 5: 导出 CLI 辅助函数**

在 `app/src-tauri/src/providers/claude_cli.rs` 中，将 `resolve_claude_binary` 和 `enriched_path` 改为 `pub`（如果还不是的话）。

**Step 6: 注册命令**

在 `lib.rs` 的 `invoke_handler` 中添加：
```rust
commands::knowledge::extract_knowledge_candidates,
```

**Step 7: 验证编译**

```bash
cargo check --manifest-path app/src-tauri/Cargo.toml
```

**Step 8: 提交**

```bash
git add app/src-tauri/src/commands/knowledge.rs app/src-tauri/src/lib.rs app/src-tauri/src/providers/claude_cli.rs
git commit -m "feat: add extract_knowledge_candidates with non-streaming AI call"
```

---

## Task 4: 前端 API 封装

**Files:**
- Modify: `app/src/lib/tauri-api.ts` — 新增类型和 API 函数 (约行 48-52, 176-184)

**Step 1: 新增类型**

在 `KnowledgeEntry` 接口附近新增：

```typescript
export interface KnowledgeCandidate {
  category: string
  title: string
  content: string
  source: string
}
```

**Step 2: 新增 API 调用**

在知识库 API 区域末尾新增：

```typescript
recommendKnowledge: (args: { projectId: string; timing: "before_prd" | "before_review" }) =>
  invoke<KnowledgeEntry[]>("recommend_knowledge", { args }),
extractKnowledgeCandidates: (projectId: string) =>
  invoke<KnowledgeCandidate[]>("extract_knowledge_candidates", { projectId }),
```

**Step 3: 验证编译**

```bash
cd app && npx tsc --noEmit
```

**Step 4: 提交**

```bash
git add app/src/lib/tauri-api.ts
git commit -m "feat: add recommendKnowledge and extractKnowledgeCandidates API bindings"
```

---

## Task 5: 自动沉淀弹窗 UI (P3)

**Files:**
- Create: `app/src/components/knowledge-extract-dialog.tsx` — 新组件
- Modify: `app/src/pages/project/Retrospective.tsx` — 触发弹窗 (行 105-133)

**Step 1: 创建弹窗组件**

创建 `app/src/components/knowledge-extract-dialog.tsx`：

```tsx
import { useState, useEffect } from "react"
import { X, Loader2, Check, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, type KnowledgeCandidate } from "@/lib/tauri-api"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"

const CATEGORY_STYLE: Record<string, { label: string; className: string }> = {
  pitfalls:  { label: "踩坑经验", className: "bg-[rgba(245,158,11,0.1)] text-[var(--warning)]" },
  decisions: { label: "决策记录", className: "bg-[var(--accent-light)] text-[var(--accent-color)]" },
  patterns:  { label: "最佳模式", className: "bg-[var(--success-light)] text-[var(--success)]" },
  metrics:   { label: "指标设计", className: "bg-[var(--secondary)] text-[var(--text-secondary)]" },
  playbooks: { label: "打法手册", className: "bg-[var(--secondary)] text-[var(--text-secondary)]" },
  insights:  { label: "产品洞察", className: "bg-[var(--secondary)] text-[var(--text-secondary)]" },
}

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
}

export function KnowledgeExtractDialog({ projectId, open, onClose }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<(KnowledgeCandidate & { selected: boolean; expanded: boolean })[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError("")
    api.extractKnowledgeCandidates(projectId)
      .then((items) => {
        setCandidates(items.map((c) => ({ ...c, selected: true, expanded: false })))
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [open, projectId])

  const toggleSelect = (i: number) => {
    setCandidates((prev) => prev.map((c, j) => j === i ? { ...c, selected: !c.selected } : c))
  }
  const toggleExpand = (i: number) => {
    setCandidates((prev) => prev.map((c, j) => j === i ? { ...c, expanded: !c.expanded } : c))
  }
  const updateField = (i: number, field: "title" | "content", value: string) => {
    setCandidates((prev) => prev.map((c, j) => j === i ? { ...c, [field]: value } : c))
  }

  const handleSave = async () => {
    const selected = candidates.filter((c) => c.selected)
    if (selected.length === 0) { onClose(); return }
    setSaving(true)
    let saved = 0
    for (const c of selected) {
      try {
        await api.addKnowledge({ category: c.category, title: c.title, content: c.content })
        saved++
      } catch (err) {
        console.error("[KnowledgeExtract] save failed:", err)
      }
    }
    setSaving(false)
    toast(`已保存 ${saved} 条经验到知识库`, "success")
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[4px] animate-[fadeIn_150ms_ease]">
      <div className="w-[560px] max-h-[80vh] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-xl)] animate-[dialogIn_200ms_var(--ease-decelerate)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">沉淀项目经验</h2>
          <button onClick={onClose} className="rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {loading && (
            <div className="flex items-center gap-3 py-12 justify-center text-[var(--text-secondary)]">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">正在分析项目产出物...</span>
            </div>
          )}

          {error && (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--destructive)]">{error}</p>
              <button onClick={onClose} className="mt-3 text-sm text-[var(--accent-color)] hover:underline">关闭</button>
            </div>
          )}

          {!loading && !error && candidates.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-secondary)]">未提取到可沉淀的知识点</p>
          )}

          {!loading && !error && candidates.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[var(--text-secondary)]">
                AI 从 PRD、评审报告和复盘总结中提取了以下经验，取消勾选不想保留的：
              </p>
              {candidates.map((c, i) => {
                const style = CATEGORY_STYLE[c.category] || CATEGORY_STYLE.insights
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      c.selected
                        ? "border-[var(--border)] bg-[var(--card)]"
                        : "border-transparent bg-[var(--secondary)] opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelect(i)}
                        className={cn(
                          "mt-0.5 size-4 shrink-0 rounded border transition-colors flex items-center justify-center",
                          c.selected
                            ? "bg-[var(--accent-color)] border-[var(--accent-color)]"
                            : "border-[var(--border)] bg-transparent"
                        )}
                      >
                        {c.selected && <Check className="size-3 text-white" strokeWidth={3} />}
                      </button>

                      <div className="flex-1 min-w-0">
                        {/* Title + Badge */}
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={cn("text-[11px]", style.className)}>{style.label}</Badge>
                          {c.expanded ? (
                            <input
                              value={c.title}
                              onChange={(e) => updateField(i, "title", e.target.value)}
                              className="flex-1 text-sm font-medium text-[var(--text-primary)] bg-transparent border-b border-[var(--border)] outline-none focus:border-[var(--accent-color)] px-0 py-0"
                            />
                          ) : (
                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">{c.title}</span>
                          )}
                        </div>

                        {/* Content preview / edit */}
                        {c.expanded ? (
                          <textarea
                            value={c.content}
                            onChange={(e) => updateField(i, "content", e.target.value)}
                            rows={3}
                            className="w-full mt-1 text-[13px] text-[var(--text-secondary)] bg-transparent border border-[var(--border)] rounded-md px-2 py-1.5 outline-none focus:border-[var(--accent-color)] resize-none"
                          />
                        ) : (
                          <p className="text-[13px] text-[var(--text-secondary)] line-clamp-2">{c.content}</p>
                        )}

                        {/* Source + expand toggle */}
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[11px] text-[var(--text-tertiary)]">
                            提取自{c.source}
                          </span>
                          <button
                            onClick={() => toggleExpand(i)}
                            className="text-[11px] text-[var(--accent-color)] hover:underline flex items-center gap-0.5"
                          >
                            {c.expanded ? <><ChevronDown className="size-3" />收起</> : <><ChevronRight className="size-3" />编辑</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && candidates.length > 0 && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)]">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
            >
              跳过
            </button>
            <button
              onClick={handleSave}
              disabled={saving || candidates.every((c) => !c.selected)}
              className="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)] active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {saving ? "保存中..." : `保存选中 (${candidates.filter((c) => c.selected).length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: 在 Retrospective.tsx 中触发弹窗**

在 `Retrospective.tsx` 中：

1. 新增 state：
```typescript
const [showExtractDialog, setShowExtractDialog] = useState(false)
```

2. 修改 `handleAdvance` —— 复盘完成后不直接 `navigate("/")`，而是弹出沉淀弹窗：
```typescript
await api.updatePhase({ projectId, phase: "retrospective", status: "completed", outputFile: outputFile ?? RETRO_FILE })
invalidateProject(projectId)
setShowExtractDialog(true)  // 替换原来的 navigate("/")
```

3. 弹窗关闭后再导航：
```typescript
const handleExtractClose = () => {
  setShowExtractDialog(false)
  navigate("/")
}
```

4. 在 JSX 末尾渲染弹窗：
```tsx
<KnowledgeExtractDialog
  projectId={projectId!}
  open={showExtractDialog}
  onClose={handleExtractClose}
/>
```

5. 新增 import：
```typescript
import { KnowledgeExtractDialog } from "@/components/knowledge-extract-dialog"
```

**Step 3: 验证编译**

```bash
cd app && npx tsc --noEmit
```

**Step 4: 提交**

```bash
git add app/src/components/knowledge-extract-dialog.tsx app/src/pages/project/Retrospective.tsx
git commit -m "feat: auto-extract knowledge dialog after retrospective completion"
```

---

## Task 6: PRD 前推荐 + 评审前提醒 UI (P4)

**Files:**
- Modify: `app/src/pages/project/Prd.tsx` — 替换现有推荐逻辑 (行 188-193)
- Modify: `app/src/pages/project/Review.tsx` — 替换现有推荐逻辑 (行 175-180)

**Step 1: 创建共用推荐卡片组件**

创建 `app/src/components/knowledge-recommend-panel.tsx`：

```tsx
import { useState, useEffect } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { api, type KnowledgeEntry } from "@/lib/tauri-api"
import { Badge } from "@/components/ui/badge"

const CATEGORY_LABELS: Record<string, string> = {
  pitfalls: "踩坑经验", decisions: "决策记录", patterns: "最佳模式",
  metrics: "指标设计", playbooks: "打法手册", insights: "产品洞察",
}

interface Props {
  projectId: string
  timing: "before_prd" | "before_review"
  visible: boolean // 外部控制是否应该显示（如 PRD 未生成时）
}

export function KnowledgeRecommendPanel({ projectId, timing, visible }: Props) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(`kb-recommend-${projectId}-${timing}`) === "collapsed"
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    api.recommendKnowledge({ projectId, timing }).then(setEntries).catch(console.error)
  }, [projectId, timing, visible])

  useEffect(() => {
    localStorage.setItem(`kb-recommend-${projectId}-${timing}`, collapsed ? "collapsed" : "expanded")
  }, [collapsed, projectId, timing])

  if (!visible || entries.length === 0) return null

  const isReview = timing === "before_review"
  const title = isReview ? "历史踩坑提醒" : "相关知识"
  const barColor = isReview ? "bg-[var(--warning)]" : "bg-[var(--accent-color)]"

  return (
    <div className="relative rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden mb-6">
      {/* Left color bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", barColor)} />

      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-5 py-3 text-left hover:bg-[var(--hover-bg)] transition-colors"
      >
        {collapsed ? <ChevronRight className="size-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="size-4 text-[var(--text-tertiary)]" />}
        <span className="text-sm font-medium text-[var(--text-primary)]">{title}</span>
        <span className="text-[11px] text-[var(--text-tertiary)]">{entries.length} 条</span>
      </button>

      {/* Entries */}
      {!collapsed && (
        <div className="px-5 pb-3 flex flex-col gap-2">
          {entries.map((entry) => (
            <div key={`${entry.category}-${entry.id}`} className="group">
              <button
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                className="flex items-center gap-2 w-full text-left py-1"
              >
                <Badge className="text-[10px] shrink-0" variant="outline">
                  {CATEGORY_LABELS[entry.category] || entry.category}
                </Badge>
                <span className="text-[13px] text-[var(--text-primary)] truncate">{entry.title}</span>
              </button>
              {expandedId === entry.id && (
                <div className="ml-1 pl-3 border-l-2 border-[var(--border)] mt-1 mb-2">
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {entry.content.replace(/^#\s+.*\n+/, "")}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: 替换 Prd.tsx 中的推荐逻辑**

删除现有的 `searchKnowledge(projectName)` useEffect（约行 188-193）和 `relevantKnowledge` state。

在 PRD 空状态区域的 JSX 中，用 `KnowledgeRecommendPanel` 替换：

```tsx
import { KnowledgeRecommendPanel } from "@/components/knowledge-recommend-panel"

// 在空状态区域
<KnowledgeRecommendPanel
  projectId={projectId!}
  timing="before_prd"
  visible={!existingMarkdown}
/>
```

**Step 3: 替换 Review.tsx 中的推荐逻辑**

同样删除现有的 `searchKnowledge(projectName)` useEffect 和 `relevantKnowledge` state。

在评审空状态区域的 JSX 中：

```tsx
import { KnowledgeRecommendPanel } from "@/components/knowledge-recommend-panel"

<KnowledgeRecommendPanel
  projectId={projectId!}
  timing="before_review"
  visible={!existingContent}
/>
```

**Step 4: 验证编译**

```bash
cd app && npx tsc --noEmit
```

**Step 5: 提交**

```bash
git add app/src/components/knowledge-recommend-panel.tsx app/src/pages/project/Prd.tsx app/src/pages/project/Review.tsx
git commit -m "feat: knowledge recommendation panel for PRD and Review pages"
```

---

## Task 7: 端到端手动验证

**Step 1: 启动开发环境**

```bash
cd app && npx tauri dev
```

**Step 2: 验证知识库路径修复**

1. 在知识库页面添加一条测试知识
2. 进入任意项目的 PRD 阶段，触发 AI 生成
3. 确认 AI prompt 中包含刚添加的知识条目（观察 console 日志）

**Step 3: 验证推荐功能**

1. 创建一个项目，完成需求分析阶段
2. 在知识库中添加几条与项目相关的知识
3. 进入 PRD 页面（未生成状态），检查「相关知识」面板是否出现
4. 进入评审页面（未生成状态），检查「历史踩坑提醒」面板是否出现
5. 验证可折叠、折叠状态持久化

**Step 4: 验证自动沉淀**

1. 完成一个项目的全流程（至少完成 PRD + 评审 + 复盘）
2. 复盘阶段点完成后，检查沉淀弹窗是否弹出
3. 验证默认全选、可取消勾选、可展开编辑
4. 保存后检查知识库页面是否有新增条目

**Step 5: 提交最终状态**

```bash
git add -A && git commit -m "chore: end-to-end verification complete"
```
