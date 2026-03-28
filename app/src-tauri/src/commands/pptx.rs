use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, State};
use crate::state::AppState;

// ── Types ─────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxOutlineSlide {
    pub page_type: String,
    pub title: String,
    pub bullets: Vec<String>,
    pub sub_layout: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxResult {
    pub path: String,
    pub slide_count: usize,
}

// ── Commands ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_pptx(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    outline: Vec<PptxOutlineSlide>,
    color_scheme: String,
    style: String,
) -> Result<PptxResult, String> {
    // Resolve project output dir (scoped to release lock before await)
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            rusqlite::params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("项目不存在: {e}"))?
    };

    // Write outline to temp JSON
    let outline_json = serde_json::to_string_pretty(&outline)
        .map_err(|e| format!("序列化大纲失败: {e}"))?;
    let tmp_dir = std::env::temp_dir().join("ai-pm-pptx");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let outline_path = tmp_dir.join(format!("{project_id}_outline.json"));
    std::fs::write(&outline_path, &outline_json).map_err(|e| e.to_string())?;

    // Output path
    let pptx_path = Path::new(&output_dir).join("09-presentation.pptx");

    // Resolve script path
    let skills_root = crate::commands::stream::resolve_skills_root(&app)?;
    let script_path = Path::new(&skills_root)
        .join("ai-pm-pptx")
        .join("scripts")
        .join("prd2pptx.py");

    if !script_path.exists() {
        return Err(format!("PPT 生成脚本未找到：{}", script_path.display()));
    }

    // Call Python script
    let output = tokio::process::Command::new("python3")
        .arg(&script_path)
        .arg("--outline")
        .arg(&outline_path)
        .arg("--output")
        .arg(&pptx_path)
        .arg("--color-scheme")
        .arg(&color_scheme)
        .arg("--style")
        .arg(&style)
        .output()
        .await
        .map_err(|e| format!("调用 python3 失败: {e}"))?;

    // Cleanup temp file
    let _ = std::fs::remove_file(&outline_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PPT 生成失败: {stderr}"));
    }

    // Parse result from stdout
    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("解析生成结果失败: {e}"))?;

    Ok(PptxResult {
        path: result["path"].as_str().unwrap_or_default().to_string(),
        slide_count: result["slide_count"].as_u64().unwrap_or(0) as usize,
    })
}

#[tauri::command]
pub fn generate_pptx_outline(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<PptxOutlineSlide>, String> {
    // Read project output dir
    let output_dir: String = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT output_dir FROM projects WHERE id = ?1",
            rusqlite::params![&project_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("项目不存在: {e}"))?
    };

    // Read PRD file
    let prd_path = Path::new(&output_dir).join("05-prd").join("05-PRD-v1.0.md");
    let prd_content = std::fs::read_to_string(&prd_path)
        .map_err(|_| "PRD 文件未找到，请先完成 Phase 5".to_string())?;

    // Parse markdown headers to generate outline
    let mut slides: Vec<PptxOutlineSlide> = Vec::new();

    // Extract product name from first H1
    let product_name = prd_content
        .lines()
        .find(|l| l.starts_with("# "))
        .map(|l| l.trim_start_matches("# ").trim().to_string())
        .unwrap_or_else(|| "产品演示".to_string());

    // Cover slide
    slides.push(PptxOutlineSlide {
        page_type: "cover".into(),
        title: product_name,
        bullets: vec!["产品需求文档演示".into()],
        sub_layout: None,
    });

    // Parse ## sections
    let mut current_section = String::new();
    let mut current_bullets: Vec<String> = Vec::new();
    let sub_layouts = ["bullet-list", "two-column", "image-text"];
    let mut content_idx: usize = 0;

    for line in prd_content.lines() {
        if let Some(title) = line.strip_prefix("## ") {
            // Flush previous section
            if !current_section.is_empty() && !current_bullets.is_empty() {
                // Chunk bullets into groups of 4
                for chunk in current_bullets.chunks(4) {
                    slides.push(PptxOutlineSlide {
                        page_type: "content".into(),
                        title: current_section.clone(),
                        bullets: chunk.to_vec(),
                        sub_layout: Some(sub_layouts[content_idx % 3].to_string()),
                    });
                    content_idx += 1;
                }
            }

            current_section = title.trim().to_string();
            current_bullets.clear();

            // Add section divider
            slides.push(PptxOutlineSlide {
                page_type: "section".into(),
                title: current_section.clone(),
                bullets: vec![],
                sub_layout: None,
            });
        } else if line.starts_with("- ") || line.starts_with("* ") {
            let bullet = line.trim_start_matches("- ").trim_start_matches("* ").trim().to_string();
            if !bullet.is_empty() {
                current_bullets.push(bullet);
            }
        }
    }

    // Flush last section
    if !current_section.is_empty() && !current_bullets.is_empty() {
        for chunk in current_bullets.chunks(4) {
            slides.push(PptxOutlineSlide {
                page_type: "content".into(),
                title: current_section.clone(),
                bullets: chunk.to_vec(),
                sub_layout: Some(sub_layouts[content_idx % 3].to_string()),
            });
            content_idx += 1;
        }
    }

    // End slide
    slides.push(PptxOutlineSlide {
        page_type: "end".into(),
        title: "谢谢".into(),
        bullets: vec![],
        sub_layout: None,
    });

    Ok(slides)
}

#[tauri::command]
pub fn list_pptx_color_schemes() -> Result<serde_json::Value, String> {
    let schemes = serde_json::json!({
        "groups": {
            "商务": ["business-authority", "platinum-white-gold", "tech-blue"],
            "创意": ["dreamy-creative", "bohemian", "art-food", "coastal-coral"],
            "自然": ["nature-outdoor", "forest-eco"],
            "学术": ["vintage-academic", "education-chart"],
            "科技": ["tech-vibrant", "tech-nightscape"],
            "其他": ["modern-health", "artisan-handmade", "elegant-fashion", "luxe-mystery", "orange-mint"]
        },
        "schemes": {
            "business-authority": { "label": "商务权威", "colors": ["#1E3A5F", "#2C5282", "#C9A84C", "#FFFFFF", "#1A202C"] },
            "platinum-white-gold": { "label": "铂金白金", "colors": ["#374151", "#6B7280", "#D4AF37", "#FAFAFA", "#111827"] },
            "tech-blue": { "label": "科技蓝", "colors": ["#1D4ED8", "#3B82F6", "#60A5FA", "#F8FAFC", "#1E293B"] },
            "dreamy-creative": { "label": "梦幻创意", "colors": ["#7C3AED", "#A78BFA", "#F472B6", "#FAF5FF", "#1F2937"] },
            "bohemian": { "label": "波西米亚", "colors": ["#DC2626", "#F97316", "#FBBF24", "#FFFBEB", "#292524"] },
            "art-food": { "label": "艺术美食", "colors": ["#B45309", "#D97706", "#92400E", "#FEF3C7", "#1C1917"] },
            "coastal-coral": { "label": "海岸珊瑚", "colors": ["#0891B2", "#06B6D4", "#FB923C", "#F0FDFA", "#164E63"] },
            "nature-outdoor": { "label": "自然户外", "colors": ["#15803D", "#22C55E", "#86EFAC", "#F0FDF4", "#14532D"] },
            "forest-eco": { "label": "森林生态", "colors": ["#166534", "#4ADE80", "#A3E635", "#ECFDF5", "#052E16"] },
            "vintage-academic": { "label": "复古学术", "colors": ["#7C2D12", "#9A3412", "#C2410C", "#FFF7ED", "#431407"] },
            "education-chart": { "label": "教育图表", "colors": ["#1B4F72", "#2980B9", "#F39C12", "#FDF6EC", "#1C2833"] },
            "tech-vibrant": { "label": "科技活力", "colors": ["#4F46E5", "#6366F1", "#EC4899", "#EEF2FF", "#1E1B4B"] },
            "tech-nightscape": { "label": "科技夜景", "colors": ["#0F172A", "#1E293B", "#38BDF8", "#020617", "#E2E8F0"] },
            "modern-health": { "label": "现代健康", "colors": ["#0D7377", "#14B8A6", "#5EEAD4", "#F0F9F4", "#134E4A"] },
            "artisan-handmade": { "label": "匠心手工", "colors": ["#78350F", "#A16207", "#CA8A04", "#FEFCE8", "#422006"] },
            "elegant-fashion": { "label": "优雅时尚", "colors": ["#831843", "#BE185D", "#F9A8D4", "#FDF2F8", "#500724"] },
            "luxe-mystery": { "label": "奢华神秘", "colors": ["#1E1B4B", "#312E81", "#C084FC", "#0C0A1D", "#DDD6FE"] },
            "orange-mint": { "label": "橙薄荷", "colors": ["#EA580C", "#F97316", "#34D399", "#FFF7ED", "#1C1917"] }
        },
        "industry_defaults": {
            "finance": "business-authority",
            "healthcare": "modern-health",
            "tech": "tech-blue",
            "education": "vintage-academic",
            "ecommerce": "bohemian",
            "enterprise": "platinum-white-gold",
            "general": "tech-blue"
        }
    });
    Ok(schemes)
}
