# Jarvis Rust Helpers

The main Jarvis agent stays in Node.js because model routing, prompts, web APIs, and tool schemas change quickly there. Rust lives here as optional native helpers for the parts where it can clearly help:

- `jarvis-indexer`: fast file walking, chunking, cache manifests, and future local vector indexing.
- `jarvis-fs`: filesystem watching and project-change events.
- `jarvis-sandbox`: stricter process execution and permission boundaries.

These helpers are intentionally small binaries with JSON output so `claw.js` or `server.js` can call them later without moving the whole agent runtime to Rust.

```bash
cargo check --manifest-path rust-helpers/Cargo.toml
cargo run --manifest-path rust-helpers/Cargo.toml -p jarvis-indexer -- --root .
```
