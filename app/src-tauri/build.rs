use std::fs;
use std::path::Path;

fn copy_dir(src: &Path, dst: &Path) {
    if !src.exists() {
        panic!("Skills source directory not found: {}", src.display());
    }
    fs::create_dir_all(dst).expect("Failed to create resources/skills dir");
    for entry in fs::read_dir(src).expect("Failed to read skills dir") {
        let entry = entry.expect("Failed to read dir entry");
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir(&src_path, &dst_path);
        } else {
            fs::copy(&src_path, &dst_path).expect("Failed to copy skill file");
        }
    }
}

fn main() {
    let skills_src = Path::new("../../.claude/skills");

    // 1. 复制到 resources/skills/ — 用于打包安装包
    copy_dir(skills_src, Path::new("resources/skills"));

    // 2. 复制到 target/{profile}/skills/ — 用于 dev 模式运行时读取
    //    OUT_DIR 形如 target/debug/build/ai-pm-xxx/out/，上溯 3 级得到 target/debug/
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let profile_dir = std::path::Path::new(&out_dir)
            .ancestors()
            .nth(3)
            .map(|p| p.to_path_buf());
        if let Some(dir) = profile_dir {
            copy_dir(skills_src, &dir.join("skills"));
        }
    }

    // Re-run if skills change
    println!("cargo:rerun-if-changed=../../.claude/skills");

    tauri_build::build()
}
