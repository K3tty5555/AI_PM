use std::fs;
use std::path::Path;
use std::process::Command;

// 私有 skill 防泄漏：跳过 .gitignore 排除的 skill（仅本机、含内网域名/凭证逻辑的 skill），
// 不打进客户端安装包。git check-ignore 退出码 0 = 被忽略、1 = 未被忽略。
// 2026-07-10 波0A#4 fail-closed：git 不可用或异常退出时直接终止构建——
// 绝不把"无法判定私有边界"当成"可复制"。
fn is_git_ignored(path: &Path) -> bool {
    match Command::new("git")
        .args(["check-ignore", "-q"])
        .arg(path)
        .status()
    {
        Ok(s) => match s.code() {
            Some(0) => true,
            Some(1) => false,
            _ => panic!(
                "git check-ignore 异常退出，无法判定私有 skill 边界（fail-closed）：{}",
                path.display()
            ),
        },
        Err(e) => panic!(
            "git 不可用，无法判定私有 skill 边界（fail-closed）：{}：{}",
            path.display(),
            e
        ),
    }
}

fn copy_dir(src: &Path, dst: &Path) {
    if !src.exists() {
        panic!("Skills source directory not found: {}", src.display());
    }
    fs::create_dir_all(dst).expect("Failed to create resources/skills dir");
    for entry in fs::read_dir(src).expect("Failed to read skills dir") {
        let entry = entry.expect("Failed to read dir entry");
        let src_path = entry.path();
        if is_git_ignored(&src_path) {
            println!(
                "cargo:warning=跳过 gitignore 的私有 skill，不打进安装包：{}",
                src_path.display()
            );
            continue;
        }
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir(&src_path, &dst_path);
        } else {
            fs::copy(&src_path, &dst_path).expect("Failed to copy skill file");
        }
    }
}

fn sync_dir(src: &Path, dst: &Path) {
    if dst.exists() {
        fs::remove_dir_all(dst).expect("Failed to clear generated skills dir");
    }
    copy_dir(src, dst);
}

fn main() {
    let skills_src = Path::new("../../.claude/skills");

    // 1. 复制到 resources/skills/ — 用于打包安装包
    sync_dir(skills_src, Path::new("resources/skills"));

    // 2. 复制到 target/{profile}/skills/ — 用于 dev 模式运行时读取
    //    OUT_DIR 形如 target/debug/build/ai-pm-xxx/out/，上溯 3 级得到 target/debug/
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let profile_dir = std::path::Path::new(&out_dir)
            .ancestors()
            .nth(3)
            .map(|p| p.to_path_buf());
        if let Some(dir) = profile_dir {
            sync_dir(skills_src, &dir.join("skills"));
        }
    }

    // Re-run if skills change
    println!("cargo:rerun-if-changed=../../.claude/skills");

    tauri_build::build()
}
