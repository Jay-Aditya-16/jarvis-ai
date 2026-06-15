#!/usr/bin/env node
import readline      from "readline";
import { exec }      from "child_process";
import { promisify } from "util";
import fs            from "fs/promises";
import fsSync        from "fs";
import path          from "path";
import chalk         from "chalk";
import ora           from "ora";
import dotenv        from "dotenv";
import { fileURLToPath } from "url";

import { getClientForModel, MODEL_CHAIN, chooseModel, markKeyExhausted, KEYS } from "./core/models.js";
import { detectSkills }                                                          from "./core/skills.js";
import { resolveWebContext }                                                     from "./core/web.js";
import { loadHistory, saveHistory, clearHistory, historyStats }                 from "./core/memory.js";
import { retrieve, formatContext }                                               from "./core/rag.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const execAsync = promisify(exec);
const MAX_LOOPS = 15;

let history = loadHistory();

// ── ASCII art ─────────────────────────────────────────────────────────────────
const CLAW_LOGO = [
  "   ╲  ╲  ╲  ╲  ╲  ╲",
  "    ╲  ╲  ╲  ╲  ╲  ╲",
  "     ╲__╲__╲__╲__╲__╲",
  "            ╲╱       ",
];

function printHeader(skillCount, serverStatus) {
  const w = 62;
  const border  = chalk.cyan("─".repeat(w));
  const pad = (s, n) => s + " ".repeat(Math.max(0, n - stripAnsi(s).length));

  const statusLine = serverStatus.online
    ? chalk.dim(`${KEYS.length} keys · ${serverStatus.models} models · firecrawl `) +
      (serverStatus.firecrawl ? chalk.green("on") : chalk.red("off"))
    : chalk.yellow("⚠ server offline — web search unavailable");

  const histLine = chalk.dim(historyStats(history));

  console.log();
  console.log(chalk.cyan("  ╭" + border + "╮"));
  console.log(chalk.cyan("  │") + " ".repeat(w) + chalk.cyan("│"));

  // Claw art + title block
  const titleLines = [
    chalk.yellow(CLAW_LOGO[0]) + "   " + chalk.white.bold("JARVIS") + chalk.dim(" × ") + chalk.cyan.bold("OPENCLAW"),
    chalk.yellow(CLAW_LOGO[1]) + "   " + chalk.dim("autonomous terminal agent"),
    chalk.yellow(CLAW_LOGO[2]) + "   " + chalk.dim(`${MODEL_CHAIN.length} models · ${skillCount} skills`),
    chalk.yellow(CLAW_LOGO[3]) + "   " + statusLine,
  ];

  for (const line of titleLines) {
    const raw = stripAnsi(line);
    const pad = Math.max(0, w - raw.length);
    console.log(chalk.cyan("  │ ") + line + " ".repeat(pad - 1) + chalk.cyan("│"));
  }

  console.log(chalk.cyan("  │") + " ".repeat(w) + chalk.cyan("│"));
  console.log(chalk.cyan("  │ ") + chalk.dim("  ↑↓ history · /help · /models · /clear · /exit") + " ".repeat(13) + chalk.cyan("│"));
  console.log(chalk.cyan("  │") + " ".repeat(w) + chalk.cyan("│"));
  console.log(chalk.cyan("  ╰" + border + "╯"));
  console.log();
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

// ── Tools ─────────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "bash",
      description: "Execute any shell command on the user's Mac. Use for EVERYTHING: running code, installs, git, npm, builds, deploys, file ops. ALWAYS call this — never write a command for the user to run.",
      parameters: {
        type: "object",
        properties: {
          command:     { type: "string", description: "The shell command to run" },
          description: { type: "string", description: "One-line description of what this does" }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full contents of a file.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write or overwrite a file with new content. Creates parent directories if needed.",
      parameters: {
        type: "object",
        properties: {
          path:    { type: "string" },
          content: { type: "string", description: "Full file content" }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List contents of a directory.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Directory path (default: .)" } },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information, docs, errors, or latest versions.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Call this ONLY when the task is fully complete or the question is purely conversational (no action needed). Pass your final response as 'result'.",
      parameters: {
        type: "object",
        properties: { result: { type: "string", description: "Final response to show the user" } },
        required: ["result"]
      }
    }
  }
];

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM = `You are Jarvis, a fully autonomous AI agent with complete access to the user's Mac.

MANDATORY RULES — no exceptions:
1. You MUST always call a tool. Never output plain text with instructions.
2. For ANY action (run code, install packages, read/write files, search web) → call the tool.
3. When done or for pure Q&A → call finish() with your response.
4. NEVER say "you can run X" or "try X" — call bash() and run it yourself.
5. Chain tools until the task is 100% done. Don't stop halfway.
6. Read files before editing. Write complete file contents, never partial.
7. For errors: diagnose → fix → re-run. Never ask the user to fix things.

FLOW: list_dir/read_file to explore → bash to execute → bash to verify → finish() to report.`;

// ── Tool executor ─────────────────────────────────────────────────────────────
async function execTool(name, args) {
  const t0 = Date.now();
  const ms = () => chalk.dim(` ${Date.now() - t0}ms`);

  switch (name) {

    case "bash": {
      const cmd = args.command?.trim();
      if (!cmd) return "ERROR: no command";
      const label = args.description || cmd.split("\n")[0].slice(0, 68);
      process.stdout.write(`\n  ${chalk.yellow("⚙")}  ${chalk.dim(label)}\n`);
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 120000, cwd: process.cwd(), shell: "/bin/zsh" });
        const out = (stdout + (stderr || "")).trim();
        process.stdout.write(`  ${chalk.green("✓")}${ms()}\n`);
        return out || "(no output)";
      } catch (e) {
        process.stdout.write(`  ${chalk.red("✗")}${ms()}\n`);
        return `EXIT ${e.code ?? 1}\n${(e.stdout || "")}${(e.stderr || "")}`.trim() || e.message;
      }
    }

    case "read_file": {
      const fp = args.path?.trim();
      process.stdout.write(`\n  ${chalk.blue("◎")}  ${chalk.dim(`read  ${fp}`)}\n`);
      try {
        const data = await fs.readFile(fp, "utf8");
        process.stdout.write(`  ${chalk.green("✓")}  ${chalk.dim(`${data.length} chars`)}${ms()}\n`);
        return data;
      } catch (e) { return `ERROR: ${e.message}`; }
    }

    case "write_file": {
      const fp = args.path?.trim();
      const content = args.content ?? "";
      if (!fp) return "ERROR: path required";
      process.stdout.write(`\n  ${chalk.magenta("✎")}  ${chalk.dim(`write ${fp}`)}\n`);
      try {
        await fs.mkdir(path.dirname(path.resolve(fp)), { recursive: true });
        await fs.writeFile(fp, content, "utf8");
        process.stdout.write(`  ${chalk.green("✓")}  ${chalk.dim(`${content.length} chars`)}${ms()}\n`);
        return `Written: ${fp}`;
      } catch (e) { return `ERROR: ${e.message}`; }
    }

    case "list_dir": {
      const dp = args.path?.trim() || ".";
      process.stdout.write(`\n  ${chalk.blue("◎")}  ${chalk.dim(`ls    ${dp}`)}\n`);
      try {
        const items = await fs.readdir(dp, { withFileTypes: true });
        process.stdout.write(`  ${chalk.green("✓")}  ${chalk.dim(`${items.length} items`)}${ms()}\n`);
        return items.map(i => `${i.isDirectory() ? "d" : "f"}  ${i.name}`).join("\n");
      } catch (e) { return `ERROR: ${e.message}`; }
    }

    case "web_search": {
      const q = args.query?.trim();
      process.stdout.write(`\n  ${chalk.cyan("◈")}  ${chalk.dim(`web   ${q}`)}\n`);
      try {
        const res  = await fetch("http://localhost:3000/api/search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const data = await res.json();
        process.stdout.write(`  ${chalk.green("✓")}${ms()}\n`);
        return data.result || "No results";
      } catch (e) { return `ERROR: ${e.message}`; }
    }

    default: return `Unknown tool: ${name}`;
  }
}

// ── Call model ────────────────────────────────────────────────────────────────
async function callModel(messages, preferredModel) {
  const queue = [preferredModel, ...MODEL_CHAIN.filter(m => m.id !== preferredModel.id)];

  for (const model of queue) {
    const maxAttempts = model.local ? 1 : Math.max(1, KEYS.length);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const client = getClientForModel(model);
        const params = { model: model.id, messages, max_tokens: 8192, temperature: 0.3 };
        if (!model.local) { params.tools = TOOLS; params.tool_choice = "required"; }
        const resp = await client.chat.completions.create(params);
        return { message: resp.choices[0].message, model };
      } catch (err) {
        const s = err?.status ?? err?.response?.status;
        if (!model.local && s === 429 && !err?.error?.metadata?.provider_name) { markKeyExhausted(); continue; }
        break;
      }
    }
  }
  throw new Error("All models unavailable");
}

// ── Stream display ────────────────────────────────────────────────────────────
async function streamDisplay(text) {
  const words = text.split(" ");
  for (const word of words) {
    process.stdout.write(chalk.white(word + " "));
    await new Promise(r => setTimeout(r, 7));
  }
}

// ── XML fallback parser ───────────────────────────────────────────────────────
function parseXMLTools(text) {
  const out = [];
  const re  = /<(bash|read_file|write_file|list_dir|web_search)((?:\s+\w+="[^"]*")*)\s*>\n?([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const attrs = { command: m[3].trim(), path: m[3].trim(), query: m[3].trim(), content: m[3] };
    const ar = /(\w+)="([^"]+)"/g; let a;
    while ((a = ar.exec(m[2])) !== null) attrs[a[1]] = a[2];
    out.push({ name: m[1], args: attrs });
  }
  const codeRe = /```(?:bash|sh|shell|zsh)\n([\s\S]*?)```/g;
  while ((m = codeRe.exec(text)) !== null)
    out.push({ name: "bash", args: { command: m[1].trim(), description: "from code block" } });
  return out;
}

// ── Main agent loop ───────────────────────────────────────────────────────────
async function agent(userInput, activeModel) {
  const t0       = Date.now();
  const preferred = activeModel ?? chooseModel(userInput);
  const skills    = detectSkills(userInput);

  if (skills.length)
    process.stdout.write(chalk.magenta(`  ◈ skills: ${skills.map(s => s.file.replace(".md","")).join(" + ")}\n`));

  const skillBlock = skills.map(s => s.content).join("\n\n---\n\n");
  const sysPrompt  = skillBlock ? `${SYSTEM}\n\n=== ACTIVE SKILLS ===\n${skillBlock}` : SYSTEM;

  const spinner = { set text(v) {} };
  const [webCtx, ragChunks] = await Promise.all([
    resolveWebContext(userInput, spinner).catch(() => ""),
    retrieve(userInput).catch(() => []),
  ]);
  if (webCtx)           process.stdout.write(chalk.dim(`  ◈ web context (${webCtx.length} chars)\n`));
  if (ragChunks.length) process.stdout.write(chalk.dim(`  ◈ rag: ${ragChunks.length} chunks\n`));

  const ragBlock = ragChunks.length ? `[RAG CONTEXT]\n${formatContext(ragChunks)}\n[END RAG CONTEXT]` : "";
  const webBlock = webCtx           ? `[WEB CONTEXT]\n${webCtx}\n[END WEB CONTEXT]`                  : "";
  const userMsg  = [userInput, ragBlock, webBlock].filter(Boolean).join("\n\n");

  const messages = [
    { role: "system", content: sysPrompt },
    ...history.slice(-20),
    { role: "user",   content: userMsg },
  ];

  // Show which model will handle this
  process.stdout.write(
    `\n  ${preferred.emoji} ${chalk.cyan(preferred.name)}` +
    chalk.dim("  thinking…") + "\n"
  );

  let loops = 0, savedReply = "", toolCalls = 0;
  let thinkSpinner = ora({ text: "", spinner: "dots", color: "cyan" });

  while (loops++ < MAX_LOOPS) {
    thinkSpinner = ora({ prefixText: "  ", spinner: "dots2", color: "cyan" }).start();

    let result;
    try {
      result = await callModel(messages, preferred);
      thinkSpinner.stop();
    } catch (e) {
      thinkSpinner.stop();
      process.stdout.write(chalk.red(`\n  ✗ ${e.message}\n`));
      break;
    }

    const { message, model } = result;

    // Show fallback model if different
    if (model.id !== preferred.id) {
      process.stdout.write(chalk.dim(`  ⟳ fallback → ${model.emoji} ${model.name}\n`));
    }

    // ── Function calling path ─────────────────────────────────────────────────
    if (message.tool_calls?.length) {
      messages.push(message);
      let done = false;

      for (const tc of message.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}

        if (tc.function.name === "finish") {
          const reply = args.result || "Done.";
          process.stdout.write("\n");
          await streamDisplay(reply);
          process.stdout.write("\n");
          savedReply = reply;
          done = true;
          messages.push({ role: "tool", tool_call_id: tc.id, content: "displayed" });
          break;
        }

        toolCalls++;
        const out = await execTool(tc.function.name, args);
        if (!savedReply) savedReply = message.content || "";
        messages.push({ role: "tool", tool_call_id: tc.id, content: String(out) });
      }

      if (done) break;

      // Show iteration counter after each round of tool calls
      process.stdout.write(chalk.dim(`\n  [${loops}/${MAX_LOOPS}] continuing…\n`));
      continue;
    }

    // ── Fallback: XML / code-block path ───────────────────────────────────────
    const text = message.content || "";
    const fallbackTools = parseXMLTools(text);

    if (fallbackTools.length) {
      messages.push({ role: "assistant", content: text });
      const results = [];
      for (const t of fallbackTools) {
        toolCalls++;
        const out = await execTool(t.name, t.args);
        results.push(`Tool: ${t.name}\nResult: ${out}`);
      }
      messages.push({ role: "user", content: results.join("\n\n") });
      process.stdout.write(chalk.dim(`\n  [${loops}/${MAX_LOOPS}] continuing…\n`));
      continue;
    }

    // Pure text — display and stop
    process.stdout.write("\n");
    await streamDisplay(text);
    process.stdout.write("\n");
    savedReply = text;
    messages.push({ role: "assistant", content: text });
    break;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(
    "\n  " +
    chalk.dim("─".repeat(50)) + "\n  " +
    chalk.green("✦") + chalk.dim(` done · ${toolCalls} tool call${toolCalls !== 1 ? "s" : ""} · ${elapsed}s`) +
    "\n"
  );

  history.push({ role: "user",      content: userInput });
  history.push({ role: "assistant", content: savedReply });
  saveHistory(history);
}

// ── UI ────────────────────────────────────────────────────────────────────────
function printHelp() {
  const row = (cmd, desc) =>
    `  ${chalk.cyan(cmd.padEnd(14))}${chalk.dim(desc)}`;
  console.log(
    "\n" +
    chalk.dim("  ── commands ──────────────────────────────────\n") +
    row("/models",   "Show model chain and routing") + "\n" +
    row("/clear",    "Clear conversation history") + "\n" +
    row("/history",  "Show turn count and memory path") + "\n" +
    row("/status",   "Check server and key status") + "\n" +
    row("/exit",     "Quit") + "\n" +
    chalk.dim("\n  ── tips ───────────────────────────────────────\n") +
    `  ${chalk.dim("↑↓")}              browse input history\n` +
    `  ${chalk.dim("Ctrl+C")}          abort current task\n` +
    `  ${chalk.dim("node server.js")}  required for web search\n` +
    "\n"
  );
}

async function getServerStatus() {
  try {
    const s = await (await fetch("http://localhost:3000/api/status", { signal: AbortSignal.timeout(2000) })).json();
    return { online: true, models: s.models, firecrawl: s.firecrawl };
  } catch {
    return { online: false };
  }
}

async function main() {
  console.clear();

  const skillCount   = fsSync.existsSync("skills")
    ? fsSync.readdirSync("skills").filter(f => f.endsWith(".md")).length
    : 0;
  const serverStatus = await getServerStatus();

  printHeader(skillCount, serverStatus);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  // Track current model for prompt display
  let currentModel = MODEL_CHAIN[0];

  const prompt = () => {
    const modelTag = chalk.dim(`${currentModel.emoji} ${currentModel.name.split(" ")[0].toLowerCase()}`);
    rl.question(chalk.cyan("\n ❯ ") + chalk.dim("") , async (raw) => {
      const input = raw.trim();
      if (!input) return prompt();

      if (input === "/exit" || input === "/quit") {
        console.log(chalk.dim("\n  bye\n"));
        process.exit(0);
      }

      if (input === "/clear") {
        history = [];
        clearHistory();
        console.log(chalk.dim("  ✓ history cleared"));
        return prompt();
      }

      if (input === "/history") {
        console.log(chalk.dim(`\n  ${historyStats(history)}\n`));
        return prompt();
      }

      if (input === "/help") {
        printHelp();
        return prompt();
      }

      if (input === "/models") {
        console.log();
        MODEL_CHAIN.forEach((m, i) => {
          const active = m.id === currentModel.id ? chalk.green(" ◀") : "";
          console.log(
            `  ${chalk.dim(String(i + 1).padStart(2))}  ${m.emoji}  ` +
            chalk.cyan(m.name.padEnd(26)) +
            chalk.dim(m.role.padEnd(10)) +
            chalk.dim(m.id) +
            active
          );
        });
        console.log();
        return prompt();
      }

      if (input === "/status") {
        const s = await getServerStatus();
        if (s.online) {
          console.log(chalk.dim(`\n  server online · ${s.models} models · firecrawl ${s.firecrawl ? chalk.green("on") : chalk.red("off")} · ${historyStats(history)}\n`));
        } else {
          console.log(chalk.yellow("\n  server offline\n"));
        }
        return prompt();
      }

      // Detect explicit model override: "/use 3" or "/model qwen"
      if (input.startsWith("/use ") || input.startsWith("/model ")) {
        const q = input.split(" ").slice(1).join(" ");
        const idx = parseInt(q) - 1;
        const found = !isNaN(idx) ? MODEL_CHAIN[idx] : MODEL_CHAIN.find(m => m.name.toLowerCase().includes(q.toLowerCase()));
        if (found) { currentModel = found; console.log(chalk.dim(`\n  model → ${found.emoji} ${found.name}\n`)); }
        else        console.log(chalk.red(`  model not found: ${q}`));
        return prompt();
      }

      currentModel = chooseModel(input);
      await agent(input, currentModel);
      prompt();
    });
  };

  prompt();
}

main();
