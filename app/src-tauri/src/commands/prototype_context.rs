use chrono::{Local, Utc};
use regex::Regex;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use walkdir::{DirEntry, WalkDir};

use crate::state::AppState;

const MAX_READ_BYTES: usize = 80 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractCodebaseFingerprintArgs {
    pub project_id: String,
    pub codebase_path: String,
    pub force: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodebaseFingerprint {
    pub status: String,
    pub codebase_path: String,
    pub layout_path: String,
    pub extracted_at: String,
    pub cached: bool,
    pub summary: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Default)]
struct FingerprintParts {
    token_blocks: Vec<String>,
    layout_blocks: Vec<String>,
    routes: Vec<String>,
    components: Vec<String>,
    warnings: Vec<String>,
}

#[tauri::command]
pub fn get_codebase_fingerprint(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Option<CodebaseFingerprint>, String> {
    let (project_name, output_dir) = get_project_paths(&state, &project_id)?;
    let layout_path = Path::new(&output_dir).join("_memory/layout-shell.md");
    if !layout_path.exists() {
        return Ok(None);
    }

    let content =
        fs::read_to_string(&layout_path).map_err(|e| format!("读取设计指纹失败: {}", e))?;
    Ok(Some(parse_fingerprint_result(
        &project_name,
        &output_dir,
        &content,
        false,
    )))
}

#[tauri::command]
pub fn extract_codebase_fingerprint(
    state: State<'_, AppState>,
    args: ExtractCodebaseFingerprintArgs,
) -> Result<CodebaseFingerprint, String> {
    let (project_name, output_dir) = get_project_paths(&state, &args.project_id)?;
    let codebase = validate_codebase_path(&args.codebase_path)?;

    let memory_dir = Path::new(&output_dir).join("_memory");
    let layout_path = memory_dir.join("layout-shell.md");
    let force = args.force.unwrap_or(false);
    if layout_path.exists() && !force {
        if let Ok(content) = fs::read_to_string(&layout_path) {
            if !content.contains("status: failed") {
                return Ok(parse_fingerprint_result(
                    &project_name,
                    &output_dir,
                    &content,
                    true,
                ));
            }
        }
    }

    let parts = extract_parts(&codebase);
    fs::create_dir_all(&memory_dir).map_err(|e| format!("创建 _memory 目录失败: {}", e))?;

    let status = if parts.token_blocks.is_empty()
        && parts.layout_blocks.is_empty()
        && parts.routes.is_empty()
        && parts.components.is_empty()
    {
        "failed"
    } else if parts.warnings.is_empty() {
        "ok"
    } else {
        "partial"
    };

    let markdown = build_layout_shell_markdown(&project_name, &codebase, status, &parts);
    fs::write(&layout_path, markdown).map_err(|e| format!("写入设计指纹失败: {}", e))?;
    update_status_codebase_path(&output_dir, &codebase)?;

    let content = fs::read_to_string(&layout_path).map_err(|e| e.to_string())?;
    Ok(parse_fingerprint_result(
        &project_name,
        &output_dir,
        &content,
        false,
    ))
}

fn get_project_paths(
    state: &State<'_, AppState>,
    project_id: &str,
) -> Result<(String, String), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT name, output_dir FROM projects WHERE id = ?1",
        params![project_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )
    .map_err(|e| format!("Project not found: {}", e))
}

fn validate_codebase_path(input: &str) -> Result<PathBuf, String> {
    let raw = Path::new(input);
    if !raw.is_absolute() {
        return Err(format!(
            "路径 {} 不在允许范围内，请使用绝对路径且位于 home 目录下。",
            input
        ));
    }

    let home = dirs::home_dir().ok_or_else(|| "无法确定 home 目录".to_string())?;
    let home = home
        .canonicalize()
        .map_err(|e| format!("读取 home 目录失败: {}", e))?;
    let canonical = raw
        .canonicalize()
        .map_err(|e| format!("代码仓路径不可访问: {}", e))?;

    if !canonical.is_dir() || !(canonical == home || canonical.starts_with(&home)) {
        return Err(format!(
            "路径 {} 不在允许范围内，请使用绝对路径且位于 home 目录下。",
            input
        ));
    }

    Ok(canonical)
}

fn skip_dir(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return true;
    }
    let name = entry.file_name().to_string_lossy();
    !matches!(
        &*name,
        ".git"
            | "node_modules"
            | "dist"
            | "build"
            | "target"
            | ".next"
            | ".nuxt"
            | "coverage"
            | ".turbo"
    )
}

fn read_text(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    if bytes.len() > MAX_READ_BYTES {
        return Some(String::from_utf8_lossy(&bytes[..MAX_READ_BYTES]).to_string());
    }
    Some(String::from_utf8_lossy(&bytes).to_string())
}

fn rel(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn has_ext(path: &Path, exts: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| exts.iter().any(|x| e.eq_ignore_ascii_case(x)))
        .unwrap_or(false)
}

fn find_files<F>(root: &Path, max_depth: usize, limit: usize, mut predicate: F) -> Vec<PathBuf>
where
    F: FnMut(&Path) -> bool,
{
    let mut files = Vec::new();
    for entry in WalkDir::new(root)
        .max_depth(max_depth)
        .into_iter()
        .filter_entry(skip_dir)
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if predicate(path) {
            files.push(path.to_path_buf());
            if files.len() >= limit {
                break;
            }
        }
    }
    files
}

fn extract_parts(codebase: &Path) -> FingerprintParts {
    let mut parts = FingerprintParts::default();
    extract_tokens(codebase, &mut parts);
    extract_layout(codebase, &mut parts);
    extract_routes(codebase, &mut parts);
    extract_components(codebase, &mut parts);
    parts
}

fn extract_tokens(codebase: &Path, parts: &mut FingerprintParts) {
    let src = codebase.join("src");
    let search_root = if src.exists() {
        src.as_path()
    } else {
        codebase
    };
    let token_re = Regex::new(
        r"(?i)^\s*(--|[$@])[\w-]*(color|primary|brand|accent|warning|danger|success|error|background|text|border)[\w-]*\s*[:=]",
    )
    .unwrap();

    let named = find_files(search_root, 7, 4, |path| {
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        matches!(
            name,
            "css-var.scss"
                | "variables.scss"
                | "colors.scss"
                | "tokens.scss"
                | "variables.less"
                | "colors.less"
                | "theme.css"
        )
    });

    for path in named {
        if let Some(content) = read_text(&path) {
            let lines: Vec<String> = content
                .lines()
                .filter(|line| token_re.is_match(line))
                .take(30)
                .map(|line| line.trim().to_string())
                .collect();
            if !lines.is_empty() {
                parts.token_blocks.push(format!(
                    "/* 来源：{} */\n{}",
                    rel(codebase, &path),
                    lines.join("\n")
                ));
            }
        }
    }

    if !parts.token_blocks.is_empty() {
        return;
    }

    let css_files = find_files(search_root, 7, 3, |path| {
        has_ext(path, &["css", "scss", "less"])
            && read_text(path)
                .map(|c| c.contains("--") && c.to_lowercase().contains("color"))
                .unwrap_or(false)
    });
    for path in css_files {
        if let Some(content) = read_text(&path) {
            let lines: Vec<String> = content
                .lines()
                .filter(|line| token_re.is_match(line) || line.trim_start().starts_with("--"))
                .take(30)
                .map(|line| line.trim().to_string())
                .collect();
            if !lines.is_empty() {
                parts.token_blocks.push(format!(
                    "/* 来源：{} */\n{}",
                    rel(codebase, &path),
                    lines.join("\n")
                ));
            }
        }
    }

    if !parts.token_blocks.is_empty() {
        return;
    }

    let tailwind = find_files(codebase, 4, 1, |path| {
        path.file_name()
            .and_then(|n| n.to_str())
            .map(|name| name.starts_with("tailwind.config."))
            .unwrap_or(false)
    });
    if let Some(path) = tailwind.first() {
        if let Some(content) = read_text(path) {
            let lines: Vec<String> = content
                .lines()
                .filter(|line| {
                    let lower = line.to_lowercase();
                    lower.contains("colors")
                        || lower.contains("primary")
                        || lower.contains("brand")
                        || lower.contains('#')
                })
                .take(30)
                .map(|line| line.trim().to_string())
                .collect();
            if !lines.is_empty() {
                parts.token_blocks.push(format!(
                    "/* 来源：{} */\n{}",
                    rel(codebase, path),
                    lines.join("\n")
                ));
            }
        }
    }

    if parts.token_blocks.is_empty() {
        parts
            .warnings
            .push("设计 Token / 色值未找到，原型会使用默认色彩方案".to_string());
    }
}

fn extract_layout(codebase: &Path, parts: &mut FingerprintParts) {
    let src = codebase.join("src");
    let search_root = if src.exists() {
        src.as_path()
    } else {
        codebase
    };
    let files = find_files(search_root, 7, 4, |path| {
        if !has_ext(path, &["vue", "tsx", "jsx", "ts", "js"]) {
            return false;
        }
        let text = path.to_string_lossy().to_lowercase();
        text.contains("layout")
            || text.contains("shell")
            || text.ends_with("app.vue")
            || text.ends_with("app.tsx")
            || text.ends_with("app.jsx")
    });

    for path in files {
        if let Some(content) = read_text(&path) {
            let lower = content.to_lowercase();
            let mut traits = Vec::new();
            if lower.contains("sidebar")
                || lower.contains("sider")
                || lower.contains("<aside")
                || lower.contains("menu")
            {
                traits.push("左侧导航/菜单");
            }
            if lower.contains("header") || lower.contains("topbar") || lower.contains("<nav") {
                traits.push("顶部导航");
            }
            if lower.contains("router-view") || lower.contains("outlet") || lower.contains("<main")
            {
                traits.push("主内容路由区");
            }
            if lower.contains("footer") {
                traits.push("底部区域");
            }

            let dims = extract_dimensions(&content);
            let mut desc = if traits.is_empty() {
                "布局结构需从文件骨架推断".to_string()
            } else {
                traits.join(" + ")
            };
            if !dims.is_empty() {
                desc.push_str(&format!("；显式尺寸：{}", dims.join("、")));
            }
            parts
                .layout_blocks
                .push(format!("- {}：{}", rel(codebase, &path), desc));
        }
    }

    if parts.layout_blocks.is_empty() {
        parts.warnings.push("主布局结构未找到".to_string());
    }
}

fn extract_dimensions(content: &str) -> Vec<String> {
    let re = Regex::new(
        r#"(?i)(width|height|min-width|max-width)\s*[:=]\s*['"]?([0-9]{2,4}(px|rem|%))"#,
    )
    .unwrap();
    re.captures_iter(content)
        .take(8)
        .map(|cap| format!("{} {}", &cap[1], &cap[2]))
        .collect()
}

fn text_window(content: &str, start: usize, max_chars: usize) -> &str {
    let mut end = content.len();
    for (count, (idx, _)) in content[start..].char_indices().enumerate() {
        if count >= max_chars {
            end = start + idx;
            break;
        }
    }
    &content[start..end]
}

fn extract_routes(codebase: &Path, parts: &mut FingerprintParts) {
    let src = codebase.join("src");
    let search_root = if src.exists() {
        src.as_path()
    } else {
        codebase
    };
    let route_files = find_files(search_root, 6, 4, |path| {
        if !has_ext(path, &["ts", "js", "tsx", "jsx", "vue"]) {
            return false;
        }
        read_text(path)
            .map(|content| {
                content.contains("createRouter")
                    || content.contains("createBrowserRouter")
                    || content.contains("routes:")
                    || content.contains("<Route")
            })
            .unwrap_or(false)
    });

    let path_re = Regex::new(r#"path\s*[:=]\s*["']([^"']+)["']"#).unwrap();
    let name_re = Regex::new(r#"name\s*:\s*["']([^"']+)["']"#).unwrap();
    let component_re = Regex::new(r#"component\s*:\s*([A-Za-z0-9_.$]+)"#).unwrap();

    for file in route_files {
        if let Some(content) = read_text(&file) {
            for cap in path_re
                .captures_iter(&content)
                .take(20 - parts.routes.len())
            {
                let start = cap.get(0).map(|m| m.start()).unwrap_or(0);
                let slice = text_window(&content, start, 240);
                let label = name_re
                    .captures(slice)
                    .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
                    .or_else(|| {
                        component_re
                            .captures(slice)
                            .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
                    })
                    .unwrap_or_else(|| rel(codebase, &file));
                parts.routes.push(format!("- {}：{}", &cap[1], label));
                if parts.routes.len() >= 20 {
                    break;
                }
            }
        }
        if parts.routes.len() >= 20 {
            break;
        }
    }

    if parts.routes.is_empty() {
        parts.warnings.push("路由页面列表未找到".to_string());
    }
}

fn extract_components(codebase: &Path, parts: &mut FingerprintParts) {
    let components_dir = codebase.join("src/components");
    let search_root = if components_dir.exists() {
        components_dir.as_path()
    } else {
        codebase
    };

    let files = find_files(search_root, 4, 5, |path| {
        has_ext(path, &["vue", "tsx", "jsx"])
    });
    for path in files {
        if let Some(content) = read_text(&path) {
            let component_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Component");
            let props = extract_props(&content);
            let structure = extract_structure(&content);
            parts.components.push(format!(
                "<!-- 组件名：{} -->\n<!-- 来源：{} -->\n<!-- Props：{} -->\n{}",
                component_name,
                rel(codebase, &path),
                props.unwrap_or_else(|| "未显式识别".to_string()),
                structure.unwrap_or_else(|| "<!-- 结构未显式识别 -->".to_string())
            ));
        }
    }

    if parts.components.is_empty() {
        parts.warnings.push("核心 UI 组件模式未找到".to_string());
    }
}

fn extract_props(content: &str) -> Option<String> {
    let define_props = Regex::new(r"defineProps\s*<([^>]+)>").unwrap();
    if let Some(cap) = define_props.captures(content) {
        return Some(cap[1].trim().replace('\n', " "));
    }

    let interface_re = Regex::new(r"interface\s+([A-Za-z0-9_]*Props)\s*\{([^}]+)\}").unwrap();
    if let Some(cap) = interface_re.captures(content) {
        let body = cap[2]
            .lines()
            .take(8)
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        return Some(format!("{} {{ {} }}", &cap[1], body));
    }

    let type_re = Regex::new(r"type\s+([A-Za-z0-9_]*Props)\s*=\s*\{([^}]+)\}").unwrap();
    type_re.captures(content).map(|cap| {
        let body = cap[2]
            .lines()
            .take(8)
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        format!("{} {{ {} }}", &cap[1], body)
    })
}

fn extract_structure(content: &str) -> Option<String> {
    if let (Some(start), Some(end)) = (content.find("<template"), content.find("</template>")) {
        let slice = &content[start..end];
        let structure = slice
            .lines()
            .skip(1)
            .take(12)
            .map(|line| strip_vue_directives(line.trim()))
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        if !structure.is_empty() {
            return Some(structure);
        }
    }

    let jsx_lines = content
        .lines()
        .filter(|line| {
            let t = line.trim_start();
            t.starts_with('<') && !t.starts_with("</") && !t.starts_with("<!")
        })
        .take(10)
        .map(|line| line.trim().to_string())
        .collect::<Vec<_>>();
    if jsx_lines.is_empty() {
        None
    } else {
        Some(jsx_lines.join("\n"))
    }
}

fn strip_vue_directives(line: &str) -> String {
    let directive_re = Regex::new(r#"\s+(v-|:|@)[A-Za-z0-9:_-]+(="[^"]*")?"#).unwrap();
    directive_re.replace_all(line, "").to_string()
}

fn build_layout_shell_markdown(
    project_name: &str,
    codebase: &Path,
    status: &str,
    parts: &FingerprintParts,
) -> String {
    if status == "failed" {
        return format!(
            "# {} · 布局指纹\n\n> 提取自：{}\n> 提取时间：{}\n> status: failed\n\n设计指纹提取失败，原型将使用默认风格生成。\n",
            project_name,
            codebase.display(),
            Local::now().format("%Y-%m-%d %H:%M")
        );
    }

    let tokens = if parts.token_blocks.is_empty() {
        "设计Token: 未找到，使用默认色彩方案".to_string()
    } else {
        parts.token_blocks.join("\n\n")
    };
    let layout = if parts.layout_blocks.is_empty() {
        "未找到明确主布局结构，按 PRD 与设计规范推断。".to_string()
    } else {
        parts.layout_blocks.join("\n")
    };
    let routes = if parts.routes.is_empty() {
        "- 未找到明确路由配置".to_string()
    } else {
        parts.routes.join("\n")
    };
    let components = if parts.components.is_empty() {
        "<!-- 未找到核心组件结构 -->".to_string()
    } else {
        parts.components.join("\n\n")
    };
    let warnings = if parts.warnings.is_empty() {
        "无".to_string()
    } else {
        parts
            .warnings
            .iter()
            .map(|item| format!("- {}", item))
            .collect::<Vec<_>>()
            .join("\n")
    };

    format!(
        "# {} · 布局指纹\n\n> 提取自：{}\n> 提取时间：{}\n> status: {}\n\n## SCSS 色值变量\n```css\n{}\n```\n\n## 主布局结构\n{}\n\n## 路由页面列表\n{}\n\n## 核心 UI 组件模式\n```html\n{}\n```\n\n## 提取警告\n{}\n",
        project_name,
        codebase.display(),
        Local::now().format("%Y-%m-%d %H:%M"),
        status,
        tokens,
        layout,
        routes,
        components,
        warnings
    )
}

fn parse_fingerprint_result(
    _project_name: &str,
    output_dir: &str,
    content: &str,
    cached: bool,
) -> CodebaseFingerprint {
    let codebase_path = content
        .lines()
        .find_map(|line| line.strip_prefix("> 提取自："))
        .unwrap_or("")
        .trim()
        .to_string();
    let extracted_at = content
        .lines()
        .find_map(|line| line.strip_prefix("> 提取时间："))
        .unwrap_or("")
        .trim()
        .to_string();
    let status = content
        .lines()
        .find_map(|line| line.strip_prefix("> status:"))
        .unwrap_or("unknown")
        .trim()
        .to_string();

    let mut summary = Vec::new();
    if content.contains("## SCSS 色值变量") && !content.contains("设计Token: 未找到") {
        summary.push("已提取色值 / 设计 Token".to_string());
    }
    if content.contains("## 主布局结构") && !content.contains("未找到明确主布局结构")
    {
        summary.push("已提取主布局结构".to_string());
    }
    if content.contains("## 路由页面列表") && !content.contains("未找到明确路由配置")
    {
        summary.push("已提取路由页面列表".to_string());
    }
    if content.contains("## 核心 UI 组件模式") && !content.contains("未找到核心组件结构")
    {
        summary.push("已提取核心组件模式".to_string());
    }
    if summary.is_empty() {
        summary.push("未形成有效设计指纹".to_string());
    }

    let warnings = content
        .split("## 提取警告")
        .nth(1)
        .map(|section| {
            section
                .lines()
                .filter_map(|line| line.trim().strip_prefix("- ").map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    CodebaseFingerprint {
        status,
        codebase_path,
        layout_path: Path::new(output_dir)
            .join("_memory/layout-shell.md")
            .to_string_lossy()
            .to_string(),
        extracted_at,
        cached,
        summary,
        warnings,
    }
}

fn update_status_codebase_path(output_dir: &str, codebase: &Path) -> Result<(), String> {
    let status_path = Path::new(output_dir).join("_status.json");
    let mut json: Value = if status_path.exists() {
        let raw = fs::read_to_string(&status_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if !json.is_object() {
        json = serde_json::json!({});
    }
    let obj = json
        .as_object_mut()
        .ok_or_else(|| "状态文件格式异常".to_string())?;
    obj.insert(
        "updated".to_string(),
        Value::String(Utc::now().to_rfc3339()),
    );
    obj.entry("memory".to_string())
        .or_insert_with(|| serde_json::json!({}));
    if !obj.get("memory").and_then(|v| v.as_object()).is_some() {
        obj.insert("memory".to_string(), serde_json::json!({}));
    }
    if let Some(memory) = obj.get_mut("memory").and_then(|v| v.as_object_mut()) {
        memory.insert(
            "codebase_path".to_string(),
            Value::String(codebase.to_string_lossy().to_string()),
        );
    }

    let serialized = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    fs::write(status_path, serialized).map_err(|e| e.to_string())
}
