use std::env;

fn main() {
    let command = env::args().skip(1).collect::<Vec<_>>().join(" ");
    println!(
        "{{\"helper\":\"jarvis-sandbox\",\"mode\":\"dry-run\",\"command\":\"{}\"}}",
        command.replace('"', "\\\"")
    );
}
