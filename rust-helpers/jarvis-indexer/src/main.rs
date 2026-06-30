use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn walk(root: &Path, files: &mut usize, bytes: &mut u64) {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|v| v.to_str()).unwrap_or("");
        if matches!(name, ".git" | "node_modules" | "target") {
            continue;
        }
        if path.is_dir() {
            walk(&path, files, bytes);
        } else if let Ok(meta) = entry.metadata() {
            *files += 1;
            *bytes += meta.len();
        }
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let root = args
        .windows(2)
        .find(|pair| pair[0] == "--root")
        .map(|pair| PathBuf::from(&pair[1]))
        .unwrap_or_else(|| PathBuf::from("."));

    let mut files = 0usize;
    let mut bytes = 0u64;
    walk(&root, &mut files, &mut bytes);

    println!(
        "{{\"helper\":\"jarvis-indexer\",\"root\":\"{}\",\"files\":{},\"bytes\":{}}}",
        root.display(),
        files,
        bytes
    );
}
