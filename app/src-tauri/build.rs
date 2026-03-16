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
    // Copy skills from AI_PM monorepo into bundled resources
    let skills_src = Path::new("../../.claude/skills");
    let skills_dst = Path::new("resources/skills");

    copy_dir(skills_src, skills_dst);

    // Re-run if skills change
    println!("cargo:rerun-if-changed=../../.claude/skills");

    tauri_build::build()
}
