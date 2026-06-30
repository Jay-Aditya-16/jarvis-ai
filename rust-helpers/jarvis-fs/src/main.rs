use std::env;

fn main() {
    let root = env::args()
        .skip_while(|arg| arg != "--root")
        .nth(1)
        .unwrap_or_else(|| ".".to_string());

    println!(
        "{{\"helper\":\"jarvis-fs\",\"root\":\"{}\",\"status\":\"watcher scaffold ready\"}}",
        root
    );
}
