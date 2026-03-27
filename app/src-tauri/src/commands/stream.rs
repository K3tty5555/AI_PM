use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::state::AppState;
use crate::commands::config::{read_config_internal, Backend};

/// 解析打包后的 skills 目录路径。
/// Tauri 的 `resources` 配置 `["resources/skills/**/*"]` 打包后会保留
/// 源目录层级，实际路径为 `<resource_dir>/resources/skills/`。
/// 为兼容开发/打包两种环境，优先尝试 `resources/skills`，回退 `skills`。
pub fn resolve_skills_root(app: &AppHandle) -> Result<String, String> {
    let base = app.path().resource_dir()
        .map_err(|e| format!("无法获取资源目录：{}", e))?;
    let primary = base.join("resources/skills");
    if primary.is_dir() {
        return Ok(primary.to_string_lossy().to_string());
    }
    let fallback = base.join("skills");
    if fallback.is_dir() {
        return Ok(fallback.to_string_lossy().to_string());
    }
    Err(format!("技能目录不存在：已尝试 {} 和 {}", primary.display(), fallback.display()))
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

// Phase → (skill_name, input_files[], output_file, companion_skills[])
pub fn phase_config(phase: &str) -> Option<(&'static str, &'static [&'static str], &'static str, &'static [&'static str])> {
    match phase {
        "office-hours" => Some(("ai-pm",           &[],                                                                           "00-office-hours.md",           &[])),
        "requirement" => Some(("ai-pm",           &[],                                                                           "01-requirement-draft.md",      &[])),
        "analysis"    => Some(("ai-pm-analyze",    &["01-requirement-draft.md"],                                                  "02-analysis-report.md",        &[])),
        "research"    => Some(("ai-pm-research",   &["01-requirement-draft.md", "02-analysis-report.md"],                         "03-competitor-report.md",      &[])),
        "stories"     => Some(("ai-pm-story",      &["02-analysis-report.md",   "03-competitor-report.md"],                       "04-user-stories.md",           &[])),
        "prd"         => Some(("ai-pm-prd",        &["02-analysis-report.md",   "03-competitor-report.md", "04-user-stories.md"], "05-prd/05-PRD-v1.0.md",        &["Humanizer-zh"])),
        "analytics"   => Some(("ai-pm-data",       &["05-prd/05-PRD-v1.0.md"],                                                    "09-analytics-requirement.md",  &[])),
        "prototype"   => Some(("ai-pm-prototype",  &["05-prd/05-PRD-v1.0.md"],                                                    "06-prototype.html",            &["ui-ux-pro-max", "frontend-design"])),
        "review"      => Some(("ai-pm-review",        &["05-prd/05-PRD-v1.0.md"],                                                    "08-review-report.md",          &[])),
        "review-modify" => Some(("ai-pm-review-modify", &["08-review-report.md", "05-prd/05-PRD-v1.0.md"],                           "05-prd/05-PRD-v1.0.md",        &["Humanizer-zh"])),
        "retrospective" => Some(("ai-pm-retrospective", &["01-requirement-draft.md", "02-analysis-report.md", "05-prd/05-PRD-v1.0.md", "08-review-report.md"], "10-retrospective.md",          &[])),
        _ => None,
    }
}

/// Try to load a companion skill from user's ~/.claude environment.
/// Search order:
///   1. ~/.claude/skills/<name>/SKILL.md  (user-installed skills)
///   2. installPath from ~/.claude/plugins/installed_plugins.json  (plugins)
/// Returns None silently if not found — phases degrade gracefully.
fn load_user_companion(skill_name: &str) -> Option<String> {
    let home = dirs::home_dir()?;

    // 1. User skills dir
    let skill_path = home.join(".claude/skills").join(skill_name).join("SKILL.md");
    if skill_path.exists() {
        return fs::read_to_string(&skill_path).ok();
    }

    // 2. Plugin cache via installed_plugins.json
    let plugins_json = home.join(".claude/plugins/installed_plugins.json");
    if let Ok(raw) = fs::read_to_string(&plugins_json) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(plugins) = cfg.get("plugins").and_then(|v| v.as_object()) {
                for (key, entries) in plugins {
                    // key format: "frontend-design@claude-plugins-official"
                    let plugin_short = key.split('@').next().unwrap_or("");
                    if plugin_short.eq_ignore_ascii_case(skill_name) {
                        if let Some(first) = entries.as_array().and_then(|a| a.first()) {
                            if let Some(install_path) = first.get("installPath").and_then(|v| v.as_str()) {
                                let md = Path::new(install_path).join("SKILL.md");
                                if let Ok(content) = fs::read_to_string(&md) {
                                    return Some(content);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

pub fn load_skill(skills_root: &str, skill_name: &str) -> Result<String, String> {
    let skill_dir = Path::new(skills_root).join(skill_name);
    let entry = skill_dir.join("SKILL.md");

    if !entry.exists() {
        return Err(format!("Skill not found: {} (looked in {})", skill_name, skill_dir.display()));
    }

    let mut files: Vec<String> = fs::read_dir(&skill_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|f| f.ends_with(".md"))
        .collect();

    // SKILL.md first, then alphabetical
    files.retain(|f| f != "SKILL.md");
    files.sort();

    let mut sections = Vec::new();

    // SKILL.md content
    let main_content = fs::read_to_string(&entry).map_err(|e| e.to_string())?;
    sections.push(main_content);

    // Sub-files
    for file in files {
        let path = skill_dir.join(&file);
        if let Ok(content) = fs::read_to_string(&path) {
            let label = file.trim_end_matches(".md");
            sections.push(format!("\n<!-- sub-file: {} -->\n{}", label, content));
        }
    }

    Ok(sections.join("\n"))
}

pub fn load_knowledge(templates_base: &Path) -> String {
    let kb_dir = templates_base.join("knowledge-base");
    if !kb_dir.exists() {
        return String::new();
    }

    let mut category_blocks: Vec<String> = Vec::new();

    let mut categories: Vec<_> = fs::read_dir(&kb_dir)
        .map(|rd| rd.filter_map(|e| e.ok()).collect())
        .unwrap_or_default();
    categories.sort_by_key(|e| e.file_name());

    for cat_entry in categories {
        let cat_path = cat_entry.path();
        if !cat_path.is_dir() {
            continue;
        }
        let cat_name = cat_entry.file_name().to_string_lossy().to_string();

        let mut entries: Vec<String> = Vec::new();
        if let Ok(files) = fs::read_dir(&cat_path) {
            let mut file_entries: Vec<_> = files.filter_map(|e| e.ok()).collect();
            file_entries.sort_by_key(|e| e.file_name());
            for file_entry in file_entries {
                let fp = file_entry.path();
                if fp.extension().and_then(|e| e.to_str()) != Some("md") {
                    continue;
                }
                if let Ok(content) = fs::read_to_string(&fp) {
                    let trimmed = content.trim().to_string();
                    if !trimmed.is_empty() {
                        entries.push(trimmed);
                    }
                }
            }
        }

        if !entries.is_empty() {
            category_blocks.push(format!(
                "#### {}\n\n{}",
                cat_name,
                entries.join("\n\n---\n\n")
            ));
        }
    }

    if category_blocks.is_empty() {
        return String::new();
    }

    format!(
        "\n\n---\n\n### 产品知识库\n\n{}\n",
        category_blocks.join("\n\n")
    )
}

/// 加载头脑风暴对话记录，用于注入到生成 prompt 中
fn load_brainstorm_for_prompt(db: &rusqlite::Connection, project_id: &str, phase: &str) -> String {
    let mut stmt = match db.prepare(
        "SELECT role, content FROM brainstorm_messages \
         WHERE project_id = ?1 AND phase = ?2 ORDER BY seq ASC",
    ) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    let messages: Vec<(String, String)> = stmt
        .query_map(params![project_id, phase], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .ok()
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default();

    if messages.is_empty() {
        return String::new();
    }

    let total = messages.len();
    let mut result = String::from(
        "\n\n### 头脑风暴讨论记录\n\n\
         以下是用户在生成前与 AI 进行的讨论，请参考其中达成的共识来生成产出物：\n\n",
    );

    if total <= 20 {
        // 短对话：全部保留
        for (role, content) in &messages {
            let label = if role == "user" { "用户" } else { "AI" };
            result.push_str(&format!("**{}**：{}\n\n", label, content));
        }
    } else {
        // 长对话：首 4 条 + 省略标注 + 最后 10 条
        for (role, content) in messages.iter().take(4) {
            let label = if role == "user" { "用户" } else { "AI" };
            result.push_str(&format!("**{}**：{}\n\n", label, content));
        }
        result.push_str(&format!(
            "*[... 省略中间 {} 条讨论 ...]*\n\n",
            total - 14
        ));
        for (role, content) in messages.iter().skip(total - 10) {
            let label = if role == "user" { "用户" } else { "AI" };
            result.push_str(&format!("**{}**：{}\n\n", label, content));
        }
    }

    result
}

fn load_context_files(output_dir: &str, excluded: &[String]) -> String {
    let context_dir = Path::new(output_dir).join("context");
    if !context_dir.exists() {
        return String::new();
    }

    let mut file_entries: Vec<_> = fs::read_dir(&context_dir)
        .map(|rd| rd.filter_map(|e| e.ok()).collect())
        .unwrap_or_default();
    file_entries.sort_by_key(|e| e.file_name());

    let mut blocks: Vec<String> = Vec::new();
    for entry in file_entries {
        let fp = entry.path();
        if !fp.is_file() {
            continue;
        }
        if fp.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if excluded.contains(&name) {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&fp) {
            let trimmed = content.trim().to_string();
            if !trimmed.is_empty() {
                blocks.push(format!("#### {}\n\n{}", name, trimmed));
            }
        }
    }

    if blocks.is_empty() {
        return String::new();
    }

    format!(
        "### 工具上下文\n\n{}\n",
        blocks.join("\n\n---\n\n")
    )
}

fn build_system_prompt(
    skills_root: &str,
    output_dir: &str,
    project_name: &str,
    skill_name: &str,
    companion_skills: &[&str],
    input_files: &[&str],
    user_input: Option<&str>,
    team_mode: bool,
    phase: &str,
    excluded_context: &[String],
    templates_base: std::path::PathBuf,
    style_id: Option<&str>,
    is_cli: bool,
    design_spec: Option<&str>,
    brainstorm_context: &str,
    project_type: &str,
    custom_prompt: Option<&str>,
) -> Result<String, String> {
    let mut skill_content = load_skill(skills_root, skill_name)?;

    // Append companion skills (Humanizer-zh, ui-ux-pro-max, frontend-design…)
    // Priority: user's ~/.claude install → bundled resources fallback
    for &companion in companion_skills {
        let content = load_user_companion(companion)
            .or_else(|| load_skill(skills_root, companion).ok());
        if let Some(c) = content {
            skill_content.push_str(&format!("\n\n---\n\n<!-- companion: {} -->\n\n{}", companion, c));
        }
    }

    let mut parts = vec![skill_content];

    // Inject recommended knowledge base entries (max 5 entries, 2000 chars)
    let recommended = crate::commands::knowledge::recommend_knowledge_internal(
        &templates_base, output_dir, phase,
    );
    if !recommended.is_empty() {
        let mut kb_block = String::from("\n\n---\n\n### 产品知识库（推荐条目）\n\n");
        for entry in &recommended {
            kb_block.push_str(&format!("#### [{}] {}\n\n{}\n\n---\n\n", entry.category, entry.title, entry.content));
        }
        parts[0].push_str(&kb_block);
    }

    // Inject project type override (if not "general")
    if project_type != "general" {
        let override_path = templates_base.join("project-types").join(project_type).join("prompt-overrides.json");
        if override_path.exists() {
            if let Ok(raw) = fs::read_to_string(&override_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(text) = json["overrides"][phase].as_str() {
                        let capped = if text.len() > 4000 { &text[..4000] } else { text };
                        parts[0].push_str(&format!(
                            "\n\n<!-- project-type-override -->\n### 项目类型补充指令\n\n{}\n<!-- /project-type-override -->",
                            capped
                        ));
                    }
                }
            }
        }
    }

    // Inject user custom prompt override (from DB)
    if let Some(custom) = custom_prompt {
        let capped = if custom.len() > 4000 { &custom[..4000] } else { custom };
        parts[0].push_str(&format!(
            "\n\n<!-- custom-prompt-override -->\n### 用户自定义补充指令\n\n{}\n<!-- /custom-prompt-override -->",
            capped
        ));
    }

    // Context files injection (tool outputs bound to this project)
    let context_block = load_context_files(output_dir, excluded_context);
    if !context_block.is_empty() {
        parts[0].push_str("\n\n---\n\n");
        parts[0].push_str(&context_block);
    }

    // Inject reference files from 07-references/
    let refs_dir = Path::new(output_dir).join("07-references");
    if refs_dir.exists() {
        let mut ref_blocks: Vec<String> = Vec::new();
        if let Ok(entries) = fs::read_dir(&refs_dir) {
            let mut file_entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            file_entries.sort_by_key(|e| e.file_name());
            for entry in file_entries {
                let fp = entry.path();
                if !fp.is_file() { continue; }
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') { continue; }
                let ext = fp.extension().and_then(|e| e.to_str()).unwrap_or("");
                match ext {
                    "md" | "txt" => {
                        let file_size = fp.metadata().map(|m| m.len()).unwrap_or(0);
                        if file_size > 50 * 1024 {
                            // 超过 50KB 的文本文件只标注元信息
                            ref_blocks.push(format!("#### {} (文本, {}KB, 内容过大已省略)", name, file_size / 1024));
                        } else if let Ok(content) = fs::read_to_string(&fp) {
                            let trimmed = content.trim().to_string();
                            if !trimmed.is_empty() {
                                ref_blocks.push(format!("#### {} (文本)\n\n{}", name, trimmed));
                            }
                        }
                    }
                    _ => {
                        let size = fp.metadata().map(|m| m.len()).unwrap_or(0);
                        ref_blocks.push(format!("#### {} ({}, {}KB)", name, ext.to_uppercase(), size / 1024));
                    }
                }
            }
        }
        if !ref_blocks.is_empty() {
            parts[0].push_str("\n\n---\n\n### 用户参考文件\n\n以下是用户上传的参考资料，请在生成时参考：\n\n");
            parts[0].push_str(&ref_blocks.join("\n\n---\n\n"));
        }
    }

    // Inject active PRD style for prd and weekly phases
    if phase == "prd" || phase == "weekly" {
        if let Some(style) = crate::commands::templates::load_active_prd_style(&templates_base, style_id) {
            parts[0].push_str(&format!("\n\n---\n\n{}", style));
        }
    }

    // Inject design spec for prototype phase
    if phase == "prototype" {
        if let Some(spec) = design_spec {
            match spec {
                "ai-contextual" | "" => {
                    // 默认：AI 情境定制，不注入额外约束
                }
                "ant-design" => {
                    parts[0].push_str("\n\n---\n\n## 设计规范：Ant Design\n\n");
                    parts[0].push_str("使用 Ant Design 设计规范进行原型设计：\n");
                    parts[0].push_str("- 主色：#1677FF，成功：#52C41A，警告：#FAAD14，错误：#FF4D4F\n");
                    parts[0].push_str("- 圆角：6px（小）、8px（中）、12px（大）\n");
                    parts[0].push_str("- 字体：-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto\n");
                    parts[0].push_str("- 间距倍数：4px\n");
                    parts[0].push_str("- 遵循 Ant Design 的组件样式和交互模式\n");
                }
                "material-design" => {
                    parts[0].push_str("\n\n---\n\n## 设计规范：Material Design\n\n");
                    parts[0].push_str("使用 Material Design 3 设计规范进行原型设计：\n");
                    parts[0].push_str("- 主色：#6750A4，次色：#625B71，三级色：#7D5260\n");
                    parts[0].push_str("- 圆角：12px（小）、16px（中）、28px（大/FAB）\n");
                    parts[0].push_str("- 字体：Roboto, 'Noto Sans SC'\n");
                    parts[0].push_str("- 使用 Material 的 elevation 和 surface tone 系统\n");
                    parts[0].push_str("- 遵循 Material Design 3 的组件样式和交互模式\n");
                }
                "element-plus" => {
                    parts[0].push_str("\n\n---\n\n## 设计规范：Element Plus\n\n");
                    parts[0].push_str("使用 Element Plus 设计规范进行原型设计：\n");
                    parts[0].push_str("- 主色：#409EFF，成功：#67C23A，警告：#E6A23C，危险：#F56C6C\n");
                    parts[0].push_str("- 圆角：4px（小）、4px（中）、4px（大）\n");
                    parts[0].push_str("- 字体：'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei'\n");
                    parts[0].push_str("- 遵循 Element Plus 的组件样式和交互模式\n");
                }
                company_spec => {
                    // 从 templates/ui-specs/{name}/ 加载公司规范
                    let spec_dir = templates_base.join("ui-specs").join(company_spec);
                    if spec_dir.exists() {
                        let mut spec_content = format!("\n\n---\n\n## 设计规范：{}\n\n", company_spec);
                        if let Ok(readme) = fs::read_to_string(spec_dir.join("README.md")) {
                            spec_content.push_str(&readme);
                            spec_content.push('\n');
                        }
                        if let Ok(tokens) = fs::read_to_string(spec_dir.join("design-tokens.json")) {
                            spec_content.push_str("\n### Design Tokens\n\n```json\n");
                            spec_content.push_str(&tokens);
                            spec_content.push_str("\n```\n");
                        }
                        parts[0].push_str(&spec_content);
                    }
                }
            }
        }
    }

    // Project context
    let mut ctx = vec![
        String::new(),
        "---".to_string(),
        String::new(),
        "## 当前项目上下文".to_string(),
        String::new(),
        format!("- 项目名称：{}", project_name),
    ];

    // Previous outputs
    let previous_outputs: Vec<(String, String)> = input_files.iter()
        .filter_map(|filename| {
            let path = Path::new(output_dir).join(filename);
            fs::read_to_string(&path).ok().map(|c| (filename.to_string(), c))
        })
        .collect();

    if !previous_outputs.is_empty() {
        ctx.push(String::new());
        ctx.push("### 已有产出物".to_string());
        ctx.push(String::new());
        for (filename, content) in &previous_outputs {
            ctx.push(format!("#### {}", filename));
            ctx.push(String::new());
            ctx.push("```".to_string());
            ctx.push(content.clone());
            ctx.push("```".to_string());
            ctx.push(String::new());
        }
    }

    if let Some(input) = user_input {
        ctx.push(String::new());
        ctx.push("### 用户输入".to_string());
        ctx.push(String::new());
        ctx.push(input.to_string());
    }

    // Inject brainstorm discussion record (if any)
    if !brainstorm_context.is_empty() {
        ctx.push(String::new());
        ctx.push(brainstorm_context.to_string());
    }

    // Team mode: inject --team marker before non-interactive block
    if team_mode {
        ctx.push(String::new());
        ctx.push("### 多代理协作模式（--team）".to_string());
        ctx.push(String::new());
        ctx.push("本次以 `--team` 模式运行：按技能说明中的多代理协作路径执行，产出更全面深入。".to_string());
    }

    // Non-interactive mode hint — must come last so it overrides skill instructions
    ctx.push(String::new());
    ctx.push("---".to_string());
    ctx.push(String::new());
    ctx.push("### ⚠️ 非交互模式（优先级最高，覆盖以上所有指令）".to_string());
    ctx.push(String::new());
    ctx.push("你正在 **AI PM 桌面应用的流式输出模式**中运行，你的整个回复内容就是文档本身。".to_string());
    ctx.push(String::new());
    ctx.push("**强制规则（逐条执行）：**".to_string());

    if phase == "prototype" && is_cli {
        // CLI mode: Claude uses Write tool to create prototype files on disk,
        // supporting multi-file prototypes with manifest navigation.
        let proto_dir = Path::new(output_dir).join("06-prototype");
        ctx.push(format!("1. **使用 Write 工具**在 `{}/` 目录下创建原型文件", proto_dir.display()));
        ctx.push("2. **必须生成 manifest.json**（放在同一目录），格式如下：".to_string());
        ctx.push("   ```json".to_string());
        ctx.push("   { \"project\": \"项目名\", \"sections\": [{ \"id\": \"01\", \"label\": \"页面名\", \"file\": \"01-xxx.html\" }] }".to_string());
        ctx.push("   ```".to_string());
        ctx.push("3. 每个 HTML 页面须完整独立（含 `<!DOCTYPE html>`、`<style>`、`<script>`），可单独用浏览器打开".to_string());
        ctx.push("4. 简单原型可用单个 `index.html`；复杂原型按功能模块拆分为多个 HTML 文件".to_string());
        ctx.push("5. 写完所有文件后仅输出一行「✓ 原型已生成」，**不要再输出其他任何内容**".to_string());
        ctx.push("6. **禁止输出元信息**：不输出步骤说明、截图要求等".to_string());
        ctx.push("7. **禁止提问或确认**：设计规范已由用户选定，直接生成".to_string());
        ctx.push("8. **禁止过渡语句**：不要输出「好的我来生成」「首先我会」等".to_string());
    } else if phase == "prototype" {
        // API mode: output full HTML to stdout (API has higher output limits)
        ctx.push("1. **你的整个输出就是 HTML 文件本身**：第一行必须是 `<!DOCTYPE html>`，最后一行必须是 `</html>`，中间是完整的单文件 HTML+CSS+JS，不要任何前言或后记".to_string());
        ctx.push("2. **禁止输出元信息**：「已生成」「文件已保存」「截图」「manifest」「步骤」等一律不输出".to_string());
        ctx.push("3. **严禁调用任何工具**：Write、Edit、Bash、AskUserQuestion、Read 在此环境中不存在且无法执行。\
            你不需要用 Write 保存文件——后端会自动把你的输出流保存为 HTML 文件。\
            **如果你想调用工具，请直接跳过，把文件内容输出到 stdout 即可。**\
            绝对不要输出「需要您批准」「请批准 Write 工具」「等待权限」等字样。".to_string());
        ctx.push("4. **禁止提问或确认**：设计规范已由用户选定，直接生成完整 HTML 原型。".to_string());
        ctx.push("5. **禁止过渡语句**：不要输出「好的我来生成」「首先我会」等，直接从 `<!DOCTYPE html>` 开始。".to_string());
    } else if is_cli {
        // CLI mode (non-prototype): allow auxiliary tools (WebSearch/Read) but content goes to stdout
        ctx.push("1. **第一行就是文档标题**（如 `# PRD：产品名`），最后一行是文档结尾，不要有任何前言或后记".to_string());
        ctx.push("2. **禁止输出元信息**：「已生成」「文件已保存」「执行步骤」「操作结果」「PRD 已完成」等一律不输出".to_string());
        ctx.push("3. **允许使用辅助工具**：可以使用 WebSearch、Read 等工具来收集信息辅助生成，\
            但 **禁止使用 Write 工具** —— 最终文档内容必须输出到 stdout，后端会自动保存。".to_string());
        ctx.push("4. **禁止提问或确认**：导出格式默认「仅 Markdown」，用户故事按标准编写，直接生成内容".to_string());
        ctx.push("5. **禁止过渡语句**：不要输出「好的我来生成」「首先我会」等，直接从文档第一行开始".to_string());
    } else {
        // API mode: no tools available at all
        ctx.push("1. **第一行就是文档标题**（如 `# PRD：产品名`），最后一行是文档结尾，不要有任何前言或后记".to_string());
        ctx.push("2. **禁止输出元信息**：「已生成」「文件已保存」「执行步骤」「操作结果」「PRD 已完成」等一律不输出".to_string());
        ctx.push("3. **禁止调用任何工具**：Write、Edit、Bash、AskUserQuestion 在此环境中均不存在，调用无效。\
            你不需要用 Write 保存文件——后端会自动把你的输出流保存为文件。\
            **绝对不要输出「需要您批准」「请批准 Write 工具」「等待权限」等字样。**".to_string());
        ctx.push("4. **禁止提问或确认**：导出格式默认「仅 Markdown」，用户故事按标准编写，直接生成内容".to_string());
        ctx.push("5. **禁止过渡语句**：不要输出「好的我来生成」「首先我会」等，直接从文档第一行开始".to_string());
    }

    // Review phase: enumerate PRD chapters for structured opinion tagging
    if phase == "review" {
        let prd_dir = Path::new(output_dir).join("05-prd");
        // Find latest PRD version
        let mut prd_versions: Vec<u32> = Vec::new();
        if let Ok(entries) = fs::read_dir(&prd_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name().to_string_lossy().to_string();
                if let Some(rest) = name.strip_prefix("05-PRD-v") {
                    if let Some(ver_str) = rest.strip_suffix(".0.md") {
                        if let Ok(ver) = ver_str.parse::<u32>() { prd_versions.push(ver); }
                    }
                }
            }
        }
        let ver = prd_versions.iter().max().copied().unwrap_or(1);
        let prd_path = prd_dir.join(format!("05-PRD-v{}.0.md", ver));
        if let Ok(prd) = fs::read_to_string(&prd_path) {
            let chapters: Vec<&str> = prd.lines()
                .filter(|l| l.starts_with("## "))
                .map(|l| l.trim_start_matches("## ").trim())
                .collect();
            if !chapters.is_empty() {
                let list = chapters.join("、");
                ctx.push(String::new());
                ctx.push("### 评审意见格式要求".to_string());
                ctx.push(String::new());
                ctx.push(format!(
                    "每条评审意见必须标注所属 PRD 章节。可选章节：{}、全局。\
                     格式：[章节：{{章节名}}] 意见内容。无法对应具体章节的意见标注 [章节：全局]。",
                    list
                ));
            }
        }
    }

    parts.push(ctx.join("\n"));

    let full_prompt = parts.join("\n");

    // System prompt size guard — warn if exceeding 300k chars
    let char_count = full_prompt.len();
    if char_count > 300_000 {
        eprintln!(
            "[WARN] System prompt exceeds 300,000 chars ({} chars) for project '{}' phase '{}'",
            char_count, project_name, phase
        );
    }

    Ok(full_prompt)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartStreamArgs {
    pub project_id: String,
    pub phase: String,
    pub messages: Vec<ChatMessage>,
    pub excluded_context: Option<Vec<String>>,
    pub style_id: Option<String>,
    pub design_spec: Option<String>,
}

#[tauri::command]
pub async fn start_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    args: StartStreamArgs,
) -> Result<(), String> {
    let stream_key = format!("generate:{}:{}", args.project_id, args.phase);

    let (project_name, output_dir, team_mode, project_type, custom_prompt, brainstorm_context) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let result = db.query_row(
            "SELECT name, output_dir, COALESCE(team_mode, 0), COALESCE(project_type, 'general') FROM projects WHERE id = ?1",
            params![&args.project_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?, row.get::<_, String>(3)?)),
        ).map_err(|e| format!("Project not found: {}", e))?;
        let bs = load_brainstorm_for_prompt(&db, &args.project_id, &args.phase);
        // Read custom prompt override for this phase
        let cp: Option<String> = db.query_row(
            "SELECT prompt_text FROM project_prompt_overrides WHERE project_id = ?1 AND phase = ?2",
            params![&args.project_id, &args.phase],
            |row| row.get(0),
        ).ok();
        (result.0, result.1, result.2, result.3, cp, bs)
    };
    let team_mode = team_mode != 0;
    let excluded_context = args.excluded_context.unwrap_or_default();

    let (skill_name, input_files, output_file, companion_skills) = phase_config(&args.phase)
        .ok_or_else(|| format!("Unknown phase: {}", args.phase))?;

    let last_user_msg = args.messages.iter().rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.as_str());

    // Resolve bundled skills directory from app resources
    let skills_root = resolve_skills_root(&app)
        .map_err(|e| {
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &e }));
            e
        })?;

    let config = read_config_internal(&state.config_dir)
        .ok_or_else(|| {
            let msg = "未配置 AI 后端 — 请前往「设置」页面完成配置后重试。".to_string();
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &msg }));
            msg
        })?;

    let is_cli = matches!(config.backend, Backend::ClaudeCli);

    let templates_base = state.templates_base();
    let system_prompt = build_system_prompt(
        &skills_root,
        &output_dir,
        &project_name,
        skill_name,
        companion_skills,
        input_files,
        last_user_msg,
        team_mode,
        &args.phase,
        &excluded_context,
        templates_base,
        args.style_id.as_deref(),
        is_cli,
        args.design_spec.as_deref(),
        &brainstorm_context,
        &project_type,
        custom_prompt.as_deref(),
    ).map_err(|e| {
        let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &e }));
        e
    })?;

    let stream_start = Instant::now();

    // 选择 provider
    let provider: Box<dyn crate::providers::AiProvider> = match config.backend {
        Backend::ClaudeCli => {
            Box::new(crate::providers::claude_cli::ClaudeCliProvider {
                work_dir: output_dir.clone(),
            })
        }
        Backend::Api => {
            let base_url = config.base_url
                .unwrap_or_else(|| "https://api.anthropic.com".to_string());
            let api_key = config.api_key.unwrap_or_default();
            let model = config.model.clone();

            if crate::commands::config::is_anthropic(&base_url, &model) {
                Box::new(crate::providers::anthropic::AnthropicProvider {
                    api_key,
                    base_url,
                    model,
                })
            } else {
                Box::new(crate::providers::openai::OpenAIProvider {
                    api_key,
                    base_url,
                    model,
                })
            }
        }
    };

    // For CLI prototype: clear old files so disk fallback won't pick up stale content
    if is_cli && args.phase == "prototype" {
        let _ = fs::remove_file(Path::new(&output_dir).join("06-prototype.html"));
        let proto_dir = Path::new(&output_dir).join("06-prototype");
        if proto_dir.exists() {
            let _ = fs::remove_dir_all(&proto_dir);
        }
    }

    // 调用 provider，处理结果
    match provider.stream(&system_prompt, &args.messages, &app, &stream_key).await {
        Ok(result) => {
            let duration_ms = stream_start.elapsed().as_millis() as u64;

            // For prototype phase: check multi-file manifest first
            let manifest_path = Path::new(&output_dir).join("06-prototype/manifest.json");
            let (effective_output, final_text) = if args.phase == "prototype" && manifest_path.exists() {
                // Multi-file prototype: manifest-driven — don't write stdout to disk
                let manifest = fs::read_to_string(&manifest_path).unwrap_or_default();
                ("06-prototype/manifest.json".to_string(), manifest)
            } else {
                // Standard single-file logic
                let file_path = Path::new(&output_dir).join(output_file);
                if let Some(parent) = file_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }

                let disk_content = fs::read_to_string(&file_path).unwrap_or_default();
                let stdout_len = result.full_text.trim().len();
                let disk_len = disk_content.trim().len();

                // For prototype: also check the directory variant (index.html)
                let (disk_content, disk_len) = if args.phase == "prototype" && disk_len < 100 {
                    let alt = Path::new(&output_dir).join("06-prototype/index.html");
                    if let Ok(alt_content) = fs::read_to_string(&alt) {
                        let alt_len = alt_content.trim().len();
                        if alt_len > disk_len { (alt_content, alt_len) }
                        else { (disk_content, disk_len) }
                    } else {
                        (disk_content, disk_len)
                    }
                } else {
                    (disk_content, disk_len)
                };

                let ft = if disk_len > stdout_len && disk_len > 100 {
                    disk_content
                } else {
                    // Only write stdout to disk if it's substantial (not a short confirmation)
                    if stdout_len > disk_len && (args.phase != "prototype" || stdout_len > 500) {
                        let _ = fs::write(&file_path, &result.full_text);
                    }
                    result.full_text
                };

                (output_file.to_string(), ft)
            };

            let done_payload = serde_json::json!({
                "streamKey": &stream_key,
                "outputFile": effective_output,
                "durationMs": duration_ms,
                "inputTokens": result.input_tokens,
                "outputTokens": result.output_tokens,
                "costUsd": result.cost_usd,
                "finalText": final_text,
            });
            let _ = app.emit("stream_done", done_payload);
        }
        Err(e) => {
            let _ = app.emit("stream_error", serde_json::json!({ "streamKey": &stream_key, "message": &e }));
        }
    }

    Ok(())
}
