# Personal Agent Roadmap

This document captures the practical direction for making Jarvis/Claw a stronger personal AI agent without overcomplicating the current Node.js core.

## Rust Strategy

Keep the main agent in Node.js for now. Node is still the right place for LLM orchestration, tool schemas, web APIs, streaming responses, and the terminal/web UI. Add Rust later as optional helper binaries where native speed, process isolation, or filesystem performance matters.

### Where Rust Would Help

- Fast file indexing over large folders.
- Safer command sandboxing and process control.
- Local vector search, chunking, parsing, and caching.
- A small native agent runtime that manages jobs, logs, timeouts, and permissions.
- Efficient filesystem watching.
- Packaging a stable binary CLI later.

Implemented helper scaffolds:

- `jarvis-indexer` for fast project indexing, chunking, embeddings preparation, and metadata extraction.
- `jarvis-fs` for safe filesystem search, diffing, file watching, and project scans.
- `jarvis-sandbox` for command execution policies, timeouts, logs, and dangerous-command controls.

### Where Rust Would Not Help Much

- Chat completion latency.
- OpenRouter/API rate limits.
- Bad prompts or weak tool schemas.
- Weak planning loops.
- Poor memory/RAG quality.
- Web search reliability.

## Highest-Impact Agent Improvements

### 1. Better Tool Permissions

Add permission modes:

- `read-only`
- `ask-before-write`
- `full-agent`
- `dangerous-confirm`

The agent should treat commands like `rm`, dependency installs, git pushes, secret access, system path writes, and credential-touching actions as higher risk. Those actions should require either explicit user approval or a stronger mode.

### 2. Real Task Planning

Before tool use, `claw` should create an internal plan with phases:

- inspect
- diagnose
- edit
- test
- summarize

After each tool round, the agent should update progress and decide whether to continue, verify, or finish. This should make it less chaotic and reduce loops.

### 3. Better Memory

Split memory into separate stores:

- conversation history
- user preferences
- project facts
- recurring tasks
- known commands
- secrets metadata, never secret values

The current memory layer stores conversation history, but it should grow into a personal profile plus project memory system.

### 4. Project Awareness

Add a startup/project scan that detects:

- package manager
- framework
- scripts
- git status
- env files present
- test commands
- open ports

Inject this project summary into agent context so Jarvis knows what it is operating inside before it acts.

### 5. Tool Result Compression

Long command output should be compressed before going back into the model. The agent should keep:

- exit code
- command summary
- relevant errors
- changed files
- final lines or matched snippets

This reduces context noise and cost.

### 6. Safer File Editing

Avoid full-file overwrites when a smaller edit is enough. Add tools like:

- `apply_patch`
- `replace_range`
- `read_file_chunk`
- `search_files`
- `git_diff`

This reduces accidental overwrites and makes edits easier to review.

### 7. Proper Verify Phase

After edits, the agent should run relevant checks automatically:

- `npm test`
- `npm run lint`
- `node --check`
- `curl /api/status`
- project-specific commands discovered from the project scan

Verification should be part of the loop, not an afterthought.

### 8. Model Routing Upgrade

Use different models for different jobs:

- planning
- coding
- summarizing tool output
- final answer
- cheap quick responses

The current routing is a good start, but it can become a multi-step model pipeline.

### 9. Persistent Local Server

Make `server.js` auto-start or auto-check from `claw`, or make `claw` degrade gracefully when the server is not running. The user should not have to manage two terminals for common workflows.

### 10. Personal Dashboard

Add a small dashboard for:

- current tasks
- memory
- indexed projects
- API key status
- logs
- agent runs
- approve/reject tool actions

This will make the agent easier to trust and operate.

## Implemented Foundation

The implementation foundation is now in `claw.js`, `server.js`, `web/`, `core/`, and `rust-helpers/`:

- Project scanner: `core/project.js` detects package manager, scripts, frameworks, git status, env-key metadata, suggested verification commands, and visible listening ports.
- Permission policy: `core/policy.js` adds `read-only`, `ask-before-write`, `full-agent`, and `dangerous-confirm` modes.
- Safer tools: `read_file_chunk`, `search_files`, `git_diff`, `preview_edit`, `replace_range`, `insert_after`, and `delete_range` give the model smaller tools before it reaches for broad shell commands or full-file rewrites.
- Guardrails: secret files are blocked from direct reads, write/destructive commands are denied or require approval depending on mode, and command output is redacted/compressed before returning to the model.
- Agent context: each task receives project context, active permission mode, and a task-plan scaffold for inspect/diagnose/edit/test/summarize.
- Verification: changed-file runs trigger inferred checks such as `npm test`, `npm run lint`, and `node --check` where available.
- Memory: `core/memory.js` now separates conversation history, preferences, project facts, recurring tasks, known commands, and secret metadata.
- World model: `core/world.js` persists projects, tasks, recent actions, and expectations without storing secret values.
- Agent logs: `core/agent-log.js` records agent runs, tool calls, and verification summaries as JSONL.
- Server lifecycle: `core/server-lifecycle.js` lets `claw` start/check `server.js` automatically.
- Dashboard APIs: `server.js` exposes project, world, logs, tasks, MCP metadata, memory, and optional browser snapshot endpoints.
- Web dashboard: `web/index.html` includes status, project, tasks, logs, world, and MCP panels beside chat.
- Model routing: `core/model-router.js` scores prompts across coding, reasoning, thinking, fast, and general routes, then builds duplicate-free cloud/local fallback queues.
- M1-safe local AI: `core/local-ai.js` defaults to an `m1-8gb` profile and excludes heavy local models from automatic fallback unless explicitly enabled.
- Backend structure: `backend/` splits the OpenAI-compatible proxy, REST API routes, and WebSocket chat out of `server.js`.
- Benchmarks: `benchmark/agent.js` validates routing queues, local-only fallback, and the low-memory local model cap; `benchmark/validate.js` gates benchmark thresholds.
- MCP metadata: `.mcp.json` can be inspected through `core/mcp-loader.js` with env values redacted.
- Browser bridge: `core/browser.js` can snapshot page title/body text if Playwright is installed.
- CLI controls: `/mode`, `/project`, `/server`, `/world`, `/tasks`, and `/mcp` expose the active policy and local runtime state.
- Rust workspace: `rust-helpers/` includes initial `jarvis-indexer`, `jarvis-fs`, and `jarvis-sandbox` crates.

---

## Best Next Build Order From Here

1. Add an approval queue in the dashboard for write/destructive actions.
2. Build a real multi-model pipeline: cheap summarizer, planner, coder, verifier, final responder.
3. Upgrade RAG with project-specific collections, incremental indexing, and result reranking.
4. Connect Rust helpers to the Node runtime for fast indexing and sandbox dry-runs.
5. Add scheduled tasks and monitors using the world model.
6. Add signed audit logs for high-risk actions.

## Guiding Principle

Make the agent smarter through orchestration, memory, safety, and verification before moving core logic into Rust. Rust should strengthen the parts that need native performance or isolation, not replace the agent brain.
