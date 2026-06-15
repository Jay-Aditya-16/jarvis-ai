#!/usr/bin/env node
import readline   from "readline";
import { exec }   from "child_process";
import { promisify } from "util";
import fs         from "fs/promises";
import fsSync     from "fs";
import path       from "path";
import chalk      from "chalk";
import dotenv     from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const execAsync  = promisify(exec);
const JARVIS_URL = "http://localhost:3000/v1/chat/completions";
const HIST_FILE  = path.join(process.env.HOME, ".jarvis-claw-history.json");
const MAX_LOOPS  = 12;

// ── History ────────────────────────────────────────────────────────────────────
let history = [];
try { if (fsSync.existsSync(HIST_FILE)) history = JSON.parse(fsSync.readFileSync(HIST_FILE, "utf8")); } catch {}
const saveHistory = () => { try { fsSync.writeFileSync(HIST_FILE, JSON.stringify(history.slice(-60), null, 2)); } catch {} };

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM = `You are Jarvis, a fully autonomous terminal AI agent — like Claude Code.
You run locally on the user's Mac with full computer access via tools.

TOOLS — wrap content in these exact XML tags to invoke them:

<bash>
shell command here
</bash>

<read_file>
/path/to/file
</read_file>

<write_file path="/path/to/file">
file content here
</write_file>

<list_dir>
/path/to/dir
</list_dir>

<web_search>
search query
</web_search>

RULES:
- Use tools proactively and chain them to complete tasks end-to-end
- After each tool runs you get the result; continue until the task is done
- Always show a brief plan before multi-step tasks
- Format code in fenced blocks with the language tag
- Ask for confirmation before deleting files or overwriting important data
- Be concise, precise, and action-oriented`;

// ── LLM call (streaming) ───────────────────────────────────────────────────────
async function callJarvis(messages) {
  const res = await fetch(JARVIS_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer jarvis-local" },
    body:    JSON.stringify({ model: "jarvis", messages, stream: true, max_tokens: 8192, temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`Jarvis ${res.status}: ${await res.text()}`);

  let full = "", buf = "";
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();

  // State-machine to stream text but suppress tool tags
  let inTag = false, tagBuf = "";

  const flush = (chunk) => {
    for (const ch of chunk) {
      if (!inTag && ch === "<") { inTag = true; tagBuf = "<"; continue; }
      if (inTag) {
        tagBuf += ch;
        if (ch === ">") {
          // Check if it's one of our tool open-tags
          const isToolOpen = /^<(bash|read_file|write_file|list_dir|web_search)[\s>]/.test(tagBuf);
          const isToolClose = /^<\/(bash|read_file|write_file|list_dir|web_search)>/.test(tagBuf);
          if (!isToolOpen && !isToolClose) process.stdout.write(chalk.white(tagBuf));
          inTag = false; tagBuf = "";
        }
        continue;
      }
      process.stdout.write(chalk.white(ch));
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const delta = JSON.parse(raw).choices?.[0]?.delta?.content ?? "";
        if (delta) { full += delta; flush(delta); }
      } catch {}
    }
  }
  return full;
}

// ── Tool runner ────────────────────────────────────────────────────────────────
async function runTool(name, attrs, content) {
  const label = content.trim().split("\n")[0].slice(0, 70);

  switch (name) {
    case "bash": {
      process.stdout.write(chalk.dim(`\n  ⚙  bash › ${label}\n`));
      try {
        const { stdout, stderr } = await execAsync(content.trim(), { timeout: 60000, cwd: process.cwd() });
        const out = [stdout, stderr ? chalk.yellow(stderr) : ""].join("").trim();
        process.stdout.write(chalk.green("  ✓\n"));
        return out || "(no output)";
      } catch (e) {
        process.stdout.write(chalk.red("  ✗ error\n"));
        return `ERROR:\n${e.message}\n${e.stdout || ""}\n${e.stderr || ""}`.trim();
      }
    }

    case "read_file": {
      const fp = content.trim();
      process.stdout.write(chalk.dim(`\n  ◎  read › ${fp}\n`));
      try {
        const data = await fs.readFile(fp, "utf8");
        process.stdout.write(chalk.green(`  ✓  ${data.length} chars\n`));
        return data;
      } catch (e) { return `ERROR: ${e.message}`; }
    }

    case "write_file": {
      const fp = attrs.path;
      if (!fp) return "ERROR: write_file requires path attribute";
      process.stdout.write(chalk.dim(`\n  ✎  write › ${fp}\n`));
      try {
        await fs.mkdir(path.dirname(path.resolve(fp)), { recursive: true });
        await fs.writeFile(fp, content);
        process.stdout.write(chalk.green("  ✓  written\n"));
        return `Written: ${fp}`;
      } catch (e) { return `ERROR: ${e.message}`; }
    }

    case "list_dir": {
      const dp = content.trim() || ".";
      process.stdout.write(chalk.dim(`\n  ◎  ls › ${dp}\n`));
      try {
        const items = await fs.readdir(dp, { withFileTypes: true });
        return items.map(i => `${i.isDirectory() ? "📁" : "📄"} ${i.name}`).join("\n");
      } catch (e) { return `ERROR: ${e.message}`; }
    }

    case "web_search": {
      process.stdout.write(chalk.dim(`\n  🌐  search › ${content.trim()}\n`));
      try {
        const res  = await fetch("http://localhost:3000/api/search", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ query: content.trim() }),
        });
        const data = await res.json();
        process.stdout.write(chalk.green("  ✓\n"));
        return data.result || "No results";
      } catch (e) { return `ERROR: ${e.message}`; }
    }

    default: return `Unknown tool: ${name}`;
  }
}

// ── Parse tool calls ───────────────────────────────────────────────────────────
function parseTools(text) {
  const out = [];
  const re  = /<(bash|read_file|write_file|list_dir|web_search)((?:\s+\w+="[^"]*")*)\s*>\n?([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const attrs = {};
    const ar = /(\w+)="([^"]+)"/g; let a;
    while ((a = ar.exec(m[2])) !== null) attrs[a[1]] = a[2];
    out.push({ name: m[1], attrs, content: m[3], full: m[0] });
  }
  return out;
}

// ── Agent loop ─────────────────────────────────────────────────────────────────
async function agent(userInput) {
  const messages = [
    { role: "system",    content: SYSTEM },
    ...history.slice(-20),
    { role: "user",      content: userInput },
  ];

  process.stdout.write("\n");
  let firstAssistant = "";
  let loops = 0;

  while (loops++ < MAX_LOOPS) {
    let response;
    try { response = await callJarvis(messages); }
    catch (e) {
      process.stdout.write(chalk.red(`\n  ✗ ${e.message}\n`));
      return;
    }
    if (!firstAssistant) firstAssistant = response;
    messages.push({ role: "assistant", content: response });

    const tools = parseTools(response);
    if (!tools.length) break;

    const results = [];
    for (const t of tools) {
      const result = await runTool(t.name, t.attrs, t.content);
      results.push(`<tool_result tool="${t.name}">\n${result}\n</tool_result>`);
    }
    process.stdout.write("\n");
    messages.push({ role: "user", content: results.join("\n\n") });
  }

  process.stdout.write("\n");
  history.push({ role: "user",      content: userInput });
  history.push({ role: "assistant", content: firstAssistant });
  saveHistory();
}

// ── UI ─────────────────────────────────────────────────────────────────────────
const BANNER = `
${chalk.cyan("  ╭──────────────────────────────────────────────────╮")}
${chalk.cyan("  │")} ${chalk.white.bold("  JARVIS")} ${chalk.dim("+")} ${chalk.cyan.bold("OPENCLAW")}  ${chalk.dim("terminal agent")}               ${chalk.cyan("│")}
${chalk.cyan("  │")}  ${chalk.dim("bash · file · web · memory · 8 cloud + 2 local")}  ${chalk.cyan("│")}
${chalk.cyan("  ╰──────────────────────────────────────────────────╯")}
  ${chalk.dim("/help  /status  /clear  /exit")}
`;

async function main() {
  console.clear();
  console.log(BANNER);

  // Verify server
  try {
    const s = await (await fetch("http://localhost:3000/api/status")).json();
    console.log(chalk.dim(`  backend: ${s.keys} keys · ${s.models} models · firecrawl ${s.firecrawl ? "on" : "off"}\n`));
  } catch {
    console.log(chalk.red("  ✗ Jarvis server not running.\n  Start it: cd ~/jarvis-ai && node server.js\n"));
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  const prompt = () => {
    rl.question(chalk.cyan("\n ❯ "), async (raw) => {
      const input = raw.trim();
      if (!input) { prompt(); return; }

      switch (input) {
        case "/help":
          console.log(`\n  ${chalk.cyan("Commands:")}`);
          console.log("  /clear   clear conversation history");
          console.log("  /status  Jarvis backend status");
          console.log("  /exit    quit\n");
          console.log("  Just type — Jarvis has full Mac access (bash, files, web).\n");
          break;
        case "/clear":
          history = []; saveHistory();
          console.log(chalk.dim("  history cleared"));
          break;
        case "/status":
          try {
            const s = await (await fetch("http://localhost:3000/api/status")).json();
            console.log(chalk.cyan(`\n  keys: ${s.keys}  models: ${s.models}  firecrawl: ${s.firecrawl}  memory: ${s.memoryPath}`));
          } catch { console.log(chalk.red("  server offline")); }
          break;
        case "/exit": case "/quit":
          console.log(chalk.dim("\n  bye\n")); process.exit(0);
        default:
          await agent(input);
      }
      prompt();
    });
  };

  prompt();
}

main();
