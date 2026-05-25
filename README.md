# JARVIS — Terminal AI Agent

A Claude Code-style terminal AI agent powered by free OpenRouter models. Multi-model routing, RAG knowledge base, auto web search, 28+ skills, and built-in security scanning.

```
     _____                  ________    ________     ____   ____.___ _________
    /     \ _____  _______ \_____  \   \_____  \   |    | |    |   |/   _____/
   /  \ /  \\__  \ \_  __ \ /  ____/    /  ____/   |    | |    |   |\_____  \
  /    Y    \/ __ \_|  | \/  \  \___   /  \___     |    |_|    |   |/        \
  \____|__  (____  /|__|   \________\  \_______\   |______\_______ /_______  /
          \/     \/                                               \/        \/
```

## Features

- **8 free models** with automatic fallback chain (GPT-OSS 120B → Nemotron → Laguna M.1 → ...)
- **Smart routing** — coding prompts go to coding models, math to thinking models, automatically
- **28+ skills** from Anthropic and Vercel, auto-injected based on keywords
- **Local RAG** — index your own files, Jarvis answers from your actual docs
- **Live web search + scraping** via Firecrawl — auto-triggers on "search / find / latest / what is"
- **Skill Sentinel** — every third-party skill is security-scanned before install (10 threat categories)
- **Persistent conversation** — history saved to disk, survives restarts
- **CAI cybersecurity** — full kill-chain + CTF methodology built in

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/Jay-Aditya-16/jarvis-ai.git
cd jarvis-ai
npm install
```

### 2. Set up API keys

```bash
cp .env.example .env
```

Edit `.env` and add your keys:

```env
OR_KEY_1=sk-or-v1-...   # OpenRouter key (free tier: 50 req/day each)
OR_KEY_2=sk-or-v1-...   # Add up to 5 keys for 250 req/day total
FIRECRAWL_KEY=fc-...    # Optional — enables web search (firecrawl.dev)
```

**Get free OpenRouter keys:** [openrouter.ai/keys](https://openrouter.ai/keys)  
**Get free Firecrawl key:** [firecrawl.dev](https://www.firecrawl.dev) — for web search/scraping

### 3. Run

```bash
npm start
# or
node ai.js
```

---

## Usage

Just type naturally. No commands needed for most things.

```
You > fix the authentication bug in my Express app
You > explain the tradeoffs between PostgreSQL and MongoDB
You > search for the latest CVE affecting OpenSSH
You > https://docs.example.com — summarize this page
```

### Commands

| Command | Description |
|---|---|
| `/search <query>` | Web search via Firecrawl |
| `/scrape <url>` | Scrape and read a URL |
| `/model` | Show model priority chain |
| `/skill list` | List installed skills |
| `/skill registry` | Browse skills.sh catalog |
| `/skill install <name>` | Install a skill by name |
| `/skill add <url>` | Fetch + security scan + install from GitHub |
| `/skill scan <file>` | Scan a local skill file for threats |
| `/rag add <file\|dir>` | Index files into local knowledge base |
| `/rag list` | Show indexed documents |
| `/rag search <query>` | Test retrieval without AI |
| `/rag clear` | Wipe the index |
| `/cai` | Cybersecurity quick-reference |
| `/keys` | API key rotation status |
| `/history` | Conversation stats |
| `/clear` | Clear history (memory + disk) |
| `/help` | Full help |
| `/exit` | Quit |

---

## Auto-triggers (no command needed)

**Model routing** — happens automatically:
| Prompt type | Model selected |
|---|---|
| code / debug / build / fix | 💻 Laguna M.1 (coding) |
| analyze / reason / architecture | 🧠 Nemotron Super (reasoning) |
| math / proof / logic / step by step | 💭 Trinity Thinking |
| everything else | 🔥 GPT-OSS 120B |

**Skills** — injected into context when keywords match:
| Keywords | Skill loaded |
|---|---|
| drone / uav / mavlink / px4 | `drones.md` |
| ctf / htb / nmap / pentest / privesc | `cai-cybersecurity.md` |
| security / exploit / xss / sqli | `security.md` |
| react / nextjs / usestate | `vercel-react-best-practices.md` |
| mcp / model context protocol | `anthropic-mcp-builder.md` |
| startup / mvp / saas / arr | `startup.md` |
| robot / ros2 / esp32 / arduino | `robotics.md` |
| + 23 more... | |

**Web** — Firecrawl fires automatically:
- Paste any URL → page is scraped and sent as context
- Say "search / find / latest / what is / look up" → web search runs

---

## RAG — Index Your Own Docs

```bash
# In Jarvis:
/rag add ./docs
/rag add ./src
/rag add ~/notes/research.md

# Then just ask normally:
You > how does our auth flow work
# Jarvis retrieves relevant chunks from your files and answers specifically
```

Supported file types: `.md` `.txt` `.js` `.ts` `.py` `.json` `.yaml`

The embedding model (`all-MiniLM-L6-v2`, ~22MB) downloads once on first use and runs fully offline — no API key needed for RAG.

---

## Skill Sentinel

Every skill fetched via `/skill add` is automatically scanned before install:

| Severity | Threat | Action |
|---|---|---|
| 🔴 CRITICAL | Prompt injection, data exfiltration, hardcoded secrets, command injection | Blocked automatically |
| 🟡 HIGH | Obfuscation, transitive trust abuse, unauthorized tool use | Warning — you decide |
| 🟢 MEDIUM | Autonomy abuse, over-collection, supply chain risk | Warning — you decide |

---

## Benchmark

Run the eval suite to measure routing accuracy, skill precision/recall, RAG retrieval quality, and Sentinel detection rates:

```bash
npm run benchmark
```

Open `benchmark/analyze.m` in MATLAB for a full visual dashboard.

---

## Model Chain

All models are free tier on OpenRouter. Jarvis walks this chain automatically on 429/throttle:

1. 🔥 GPT-OSS 120B — default reasoning
2. 🧠 Nemotron 3 Super 120B — reasoning fallback
3. 💻 Poolside Laguna M.1 — coding
4. 💭 Trinity Large Thinking — math / logic
5. ✨ Gemma 4 31B — general
6. 🐉 Qwen3 Coder — coding fallback
7. ⚡ DeepSeek V4 Flash — fast
8. 🦙 Llama 3.3 70B — final fallback

---

## Project Structure

```
jarvis-ai/
├── ai.js              # Main entry point + REPL
├── core/
│   ├── models.js      # Model chain, routing, key management
│   ├── skills.js      # Skill triggers, detection, install, registry
│   ├── sentinel.js    # Skill Sentinel threat scanner
│   ├── web.js         # Firecrawl search + scrape
│   ├── rag.js         # Local RAG (vectra + transformers)
│   └── history.js     # Conversation memory + disk persistence
├── skills/            # 28+ skill markdown files
├── benchmark/         # Eval suite + MATLAB analysis
├── .env.example       # API key template
└── README.md
```

---

## Requirements

- Node.js 18+
- 1–5 free OpenRouter API keys
- (Optional) Firecrawl API key for web search

---

## License

MIT
