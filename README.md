# JARVIS AI — Terminal Agent

Free, local Claude Code alternative. Runs commands itself, writes files, searches the web, chains tools until done. 8 free cloud models + 2 local Ollama fallbacks + OpenClaw for full Mac control.

```
     _____                  ________    ________     ____   ____.___ _________
    /     \ _____  _______ \_____  \   \_____  \   |    | |    |   |/   _____/
   /  \ /  \\__  \ \_  __ \ /  ____/    /  ____/   |    | |    |   |\_____  \
  /    Y    \/ __ \_|  | \/  \  \___   /  \___     |    |_|    |   |/        \
  \____|__  (____  /|__|   \________\  \_______\   |______\_______ /_______  /
          \/     \/                                               \/        \/
```

---

## Modes

| Mode | Command | What it does |
|---|---|---|
| **Agent** (Claude Code-style) | `node claw.js` | Executes bash, reads/writes files, searches web. Uses function calling. Chains tools until task is done. |
| **Chat** | `node ai.js` | Conversational terminal. RAG, skills, web search. |
| **Server** | `node server.js` | OpenAI-compatible API at `localhost:3000/v1` — powers claw, web UI, and OpenClaw. |
| **Web UI** | `localhost:3000` | Browser chat after server starts. |
| **OpenClaw** | `openclaw` | Full computer agent: browser, 50+ integrations, Telegram/WhatsApp. Uses Jarvis as its LLM. |

---

## Quick Start

```bash
git clone https://github.com/Jay-Aditya-16/jarvis-ai.git
cd jarvis-ai
npm install
cp .env.example .env
# edit .env — add keys
```

**.env:**
```env
OR_KEY_1=sk-or-v1-...   # openrouter.ai/keys — free, 50 req/day each
OR_KEY_2=sk-or-v1-...   # add up to 5 for 250 req/day total
FIRECRAWL_KEY=fc-...    # firecrawl.dev — free 500 credits/month
```

---

## Agent mode (claw)

```bash
node claw.js
```

`claw` now auto-checks the local web/API server and starts it when needed. Set `JARVIS_AUTO_SERVER=0` if you want to manage `node server.js` manually.

`claw` uses **OpenAI function calling** — it executes commands itself, never tells you to run them.

```
 ❯ create a fastapi server with 3 routes and run it
 ❯ find all TODO comments in this repo and fix them
 ❯ what's the latest stable node version, update my package.json and reinstall
 ❯ clone github.com/user/repo and set it up
 ❯ search for how to fix CORS in express and apply the fix to server.js
```

### How it works

1. Routes your prompt to the best model (coding → Qwen3/Laguna, reasoning → GPT-OSS/Nemotron)
2. Auto-fetches web context if you mention URLs or search keywords
3. Model calls tools via function calling → executes bash/file/search → feeds results back
4. Loops until task complete (max 15 iterations)
5. Falls back to XML tag parsing for models that don't support function calling

### claw commands

| Command | Description |
|---|---|
| `/clear` | Clear conversation history |
| `/history` | Turn count + memory path |
| `/models` | Show full model chain |
| `/route <prompt>` | Explain auto-model routing and fallback order |
| `/local` | Show M1-safe Ollama fallback plan and installed local models |
| `/mode` | Show or set permissions: `read-only`, `ask-before-write`, `full-agent`, `dangerous-confirm` |
| `/project` | Startup scan: package manager, scripts, env metadata, git state, ports, verification commands |
| `/life` | Show LifeOS root, TELOS files, zones, and recent notes |
| `/telos` | Show mission and goals from the LifeOS layer |
| `/ideal <title>` | Create an Ideal State artifact |
| `/daily [YYYY-MM-DD]` | Create/open a daily note |
| `/weekly [YYYY-MM-DD]` | Create/open a weekly review |
| `/learn <note>` | Record a reusable learning |
| `/decision <note>` | Record a decision and rationale |
| `/server` | Start/check the local web/API server |
| `/world` | Show persistent project/task/action world summary |
| `/tasks` | Show persistent agent tasks |
| `/mcp` | Show configured MCP servers without exposing env values |
| `/exit` | Quit |

---

## Chat mode (jarvis)

```bash
node ai.js
```

```
You > fix the auth bug in my Express app
You > explain tradeoffs between PostgreSQL and MongoDB
You > https://docs.example.com — summarize this
```

### jarvis commands

| Command | Description |
|---|---|
| `/search <query>` | Web search via Firecrawl |
| `/scrape <url>` | Scrape a URL |
| `/model` | Model chain |
| `/route <prompt>` | Inspect routing and fallback queue |
| `/local` | M1-safe Ollama fallback status |
| `/skill list` | Installed skills |
| `/skill install <name>` | Install from registry |
| `/skill add <url>` | Fetch + scan + install |
| `/rag add <file\|dir>` | Index files for RAG |
| `/rag list` | Show indexed docs |
| `/keys` | Key rotation status |
| `/clear` | Clear history |
| `/help` | Full help |

---

## Model chain

| # | Model | Routing | Source |
|---|---|---|---|
| 1 | 🔥 GPT-OSS 120B | reasoning / default | OpenRouter free |
| 2 | 🧠 Nemotron Super 120B | reasoning | OpenRouter free |
| 3 | 💻 Laguna M.1 | coding | OpenRouter free |
| 4 | 💭 Trinity Thinking | math / logic | OpenRouter free |
| 5 | ✨ Gemma 4 31B | general | OpenRouter free |
| 6 | 🐉 Qwen3 Coder | coding | OpenRouter free |
| 7 | ⚡ DeepSeek V4 Flash | fast | OpenRouter free |
| 8 | 🦙 Llama 3.3 70B | general | OpenRouter free |
| 9 | 🏠 Qwen2.5 3B | local fallback | Ollama |
| 10 | 🏠 Llama3.2 3B | last resort | Ollama |

Auto-fallback on 429/rate-limit. Local models need [Ollama](https://ollama.ai) installed.

### M1 Air 8GB local fallback

Jarvis defaults to `JARVIS_LOCAL_PROFILE=m1-8gb` and only auto-routes to small local models that should stay reasonable on an 8GB Apple Silicon machine:

```bash
ollama pull qwen2.5:3b
ollama pull phi3.5:latest
ollama pull llama3.2:3b
ollama pull gemma3n:e2b
ollama pull gemma3:1b
```

The optional `gemma3:4b` fallback is excluded unless `JARVIS_LOCAL_INCLUDE_OPTIONAL=1` is set. Larger installed models, such as 7B/8B+ models, are not used in automatic fallback.

Useful knobs:

```bash
JARVIS_PREFER_LOCAL=1
JARVIS_LOCAL_ONLY=1
JARVIS_KEY_ATTEMPTS=5       # default: all configured cloud keys
JARVIS_LOCAL_MAX_MODEL_GB=3.6
```

---

## Skills (28 included)

Auto-injected into context when keywords match your message — no command needed.

**Anthropic:** Claude API, MCP builder, frontend design, webapp testing, PDF/DOCX/PPTX/XLSX, canvas, algorithmic art, brand guidelines, skill creator

**Vercel:** React, React Native, deploy to Vercel, web design, core web vitals, view transitions, composition patterns

**Custom:** drones/UAV/MAVLink, cybersecurity/CTF/kill-chain, robotics/ROS2/ESP32, startup/MVP/SaaS, code quality, security/pentest

### Skill Sentinel

Every skill fetched via `/skill add` is security-scanned before install (10 threat categories). CRITICAL = blocked. HIGH/MEDIUM = warned, your choice.

---

## RAG

Index your own codebase and Jarvis answers from it specifically:

```bash
/rag add ./src
/rag add ./docs
# Then ask normally — Jarvis retrieves relevant chunks automatically
```

Embedding model (`all-MiniLM-L6-v2`, ~22MB) runs fully offline.

---

## LifeOS-inspired personal layer

Jarvis now has a lightweight personal operating-system layer inspired by LifeOS/PAI concepts: TELOS, identity, preferences, ideal states, daily notes, weekly reviews, decisions, and learnings. It stays filesystem-first and Markdown-native instead of adding a heavy database.

Default location:

```bash
~/.jarvis-unified/life
```

Useful commands:

```bash
/life
/telos
/ideal Build a calmer agent workflow
/daily
/weekly
/learn Tool results should be summarized before hitting the model
/decision Keep the main agent in Node and add Rust helpers only where useful
```

Jarvis injects a compressed Life context into non-small-talk agent runs and exposes guarded tools for creating Life notes. Secret values are rejected; store only metadata such as "OpenRouter key exists in .env".

## OpenClaw integration

OpenClaw uses Jarvis as its LLM backend. Start the server, run `openclaw`.

Adds on top of Jarvis: browser control, file system access, 50+ integrations (Gmail, GitHub, Spotify, Obsidian…), Telegram/WhatsApp/iMessage access from your phone, persistent memory.

```bash
node server.js    # must be running
openclaw          # full computer agent
```

---

## Architecture

```
claw.js          — agentic CLI (function calling loop, Claude Code-style)
ai.js            — conversational CLI
server.js        — Express + WebSocket + OpenAI-compat API at :3000
mcp.js           — Model Context Protocol server
backend/
  api-routes.js  — REST endpoints for status, memory, project, models, tasks, logs
  openai-proxy.js — OpenAI-compatible /v1 model proxy with fallback queues
  ws-chat.js     — browser chat WebSocket handler
core/
  agent-log.js   — JSONL run/tool/verification logs
  browser.js     — optional Playwright browser snapshot bridge
  editing.js     — safer line-based edit primitives
  env.js         — project-root .env loading for global CLI use
  local-ai.js    — M1/low-RAM Ollama fallback profile and installed-model checks
  mcp-loader.js  — .mcp.json metadata reader, env values redacted
  models.js      — model chain, key rotation, Ollama client
  model-router.js — scored prompt routing and cloud/local fallback queues
  life.js        — LifeOS-inspired Markdown layer: TELOS, ideal states, daily/weekly reviews, learnings, decisions
  memory.js      — structured memory: history, preferences, facts, commands, secret metadata
  policy.js      — permission modes and command/tool risk classifier
  project.js     — startup project scanner and verify-command inference
  server-lifecycle.js — local server auto-start/check helper
  skills.js      — auto skill injection, Sentinel scanner, registry
  tasks.js       — persistent world-model task helpers
  web.js         — Firecrawl search + scraping, auto-trigger
  world.js       — persistent local world model
  rag.js         — local vector store (vectra + transformers)
  sentinel.js    — skill security scanner (10 threat categories)
skills/          — 28 skill markdown files
web/             — browser chat UI
benchmark/       — eval suite + MATLAB analysis
rust-helpers/    — optional Rust helper binaries for indexing, fs watching, sandboxing
```

Run validation:

```bash
npm run benchmark
npm run benchmark:validate
npm run benchmark:matlab  # uses MATLAB_BIN or /Applications/MATLAB_R2025b.app/bin/matlab
```

---

## Development Roadmap

Jarvis is staying Node-first for the main agent loop, with Rust reserved for optional helper binaries where it clearly helps: fast indexing, safer process control, local search, filesystem watching, and future binary packaging. The first Rust helper workspace is in `rust-helpers/`. The detailed personal-agent roadmap lives in [`docs/personal-agent-roadmap.md`](docs/personal-agent-roadmap.md).

---

## Requirements

- Node.js 18+
- 1–5 free [OpenRouter](https://openrouter.ai/keys) keys
- [Firecrawl](https://firecrawl.dev) key (optional, for web search)
- [Ollama](https://ollama.ai) (optional, for local fallback models)
- [OpenClaw](https://openclaw.ai) (optional, for full computer agent)

---

## License

MIT
