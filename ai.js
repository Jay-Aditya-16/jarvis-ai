#!/usr/bin/env node
import chalk        from "chalk";
import ora          from "ora";
import figlet       from "figlet";
import readlineSync from "readline-sync";
import fs           from "fs";

import { KEYS, getClient, markKeyExhausted, keyStatus, MODEL_CHAIN, chooseModel } from "./core/models.js";
import { detectSkills, fetchSkill, installNamedSkill, listSkills, scanLocalSkill, showRegistry, SKILLS_DIR, SKILL_TRIGGERS } from "./core/skills.js";
import { resolveWebContext, webSearch, scrapeUrl, FIRECRAWL_KEY } from "./core/web.js";
import { loadHistory, saveHistory, clearHistory, historyStats } from "./core/history.js";
import { retrieve, ingest, ingestDir, listDocuments, clearIndex, formatContext } from "./core/rag.js";

// ── Conversation state ────────────────────────────────────────────────────────
let history = loadHistory();

const BASE_SYSTEM = `You are Jarvis, an advanced AI terminal assistant.
You excel at coding, debugging, shell commands, architecture, AI systems, drones, robotics, cybersecurity, and startup MVPs.
Format code in fenced blocks with language tags. Be concise and precise. Follow instructions exactly.

CRITICAL RULE: When the user's message includes sections labeled [RAG CONTEXT] or [WEB CONTEXT], you MUST answer using that content specifically. Do not give generic answers. Reference the actual code, file names, and implementation details from the provided context. If RAG context is present, assume it is from the user's own codebase and answer accordingly.`;

// ── Core ask ──────────────────────────────────────────────────────────────────
async function askAI(userInput) {
  const preferred = chooseModel(userInput);
  const skills    = detectSkills(userInput);

  if (skills.length) {
    const names = skills.map((s) => s.file.replace(".md", "")).join(" + ");
    console.log(chalk.magenta(`  ◈ skills: ${names}`));
  }

  const skillBlock   = skills.map((s) => s.content).join("\n\n---\n\n");
  const systemPrompt = skillBlock
    ? `${BASE_SYSTEM}\n\n=== ACTIVE SKILLS ===\n${skillBlock}`
    : BASE_SYSTEM;

  const queue   = [preferred, ...MODEL_CHAIN.filter((m) => m.id !== preferred.id)];
  const spinner = ora(`${preferred.emoji} ${preferred.name}`).start();

  // RAG retrieval — runs in parallel with web context
  const [webCtx, ragChunks] = await Promise.all([
    resolveWebContext(userInput, spinner),
    retrieve(userInput).catch((e) => { console.log(chalk.red(`  ✗ rag error: ${e.message}`)); return []; }),
  ]);

  if (webCtx)          console.log(chalk.cyan(`  🌐 web context (${webCtx.length} chars)`));
  if (ragChunks.length) {
    const sources = [...new Set(ragChunks.map((c) => c.source))].join(", ");
    console.log(chalk.blue(`  ◈ rag: ${ragChunks.length} chunks from ${sources}`));
  }

  spinner.text = `${preferred.emoji} ${preferred.name}`;

  const ragCtx  = ragChunks.length
    ? `[RAG CONTEXT — excerpts from the user's own codebase. Use this to answer specifically, not generically.]\n\n${formatContext(ragChunks)}\n\n[END RAG CONTEXT]`
    : "";
  const webBlock = webCtx
    ? `[WEB CONTEXT — live search results]\n\n${webCtx}\n\n[END WEB CONTEXT]`
    : "";

  const userMessage = [userInput, ragCtx, webBlock].filter(Boolean).join("\n\n");

  for (const model of queue) {
    for (let attempt = 0; attempt < KEYS.length; attempt++) {
      try {
        const client = getClient();
        const stream = await client.chat.completions.create({
          model:       model.id,
          messages:    [
            { role: "system",    content: systemPrompt },
            ...history.slice(-20),
            { role: "user",      content: userMessage },
          ],
          stream:      true,
          max_tokens:  8192,
          temperature: 0.4,
        });

        spinner.stop();
        if (model.id !== preferred.id) {
          console.log(chalk.yellow(`  ⟳ ${model.emoji} ${model.name}`));
        }

        process.stdout.write(chalk.green("\nJarvis > "));
        let reply = "";
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          process.stdout.write(delta);
          reply += delta;
        }
        console.log("\n");

        history.push({ role: "user",      content: userInput });
        history.push({ role: "assistant", content: reply });
        saveHistory(history);
        return;

      } catch (err) {
        const status     = err?.status ?? err?.response?.status;
        const isUpstream = err?.error?.metadata?.provider_name;

        if (status === 429 && isUpstream)  break;    // upstream throttle → next model
        if (status === 429 && !isUpstream) { markKeyExhausted(); continue; } // key limit → next key
        break;
      }
    }
    spinner.text = `⟳ trying ${queue[queue.indexOf(model) + 1]?.name ?? "…"}`;
  }

  spinner.fail("All models unavailable. Wait a moment and retry.");
}

// ── Commands ──────────────────────────────────────────────────────────────────
const deps = { chalk, readlineSync };

async function handleCommand(raw) {
  const parts = raw.trim().slice(1).split(/\s+/);
  const cmd   = parts[0]?.toLowerCase();
  const args  = parts.slice(1);

  switch (cmd) {
    case "clear":
      history = [];
      clearHistory();
      console.clear();
      printBanner();
      console.log(chalk.green("✓ History cleared\n"));
      break;

    case "model":
      console.log(chalk.bold("\n  Model chain (priority order):\n"));
      MODEL_CHAIN.forEach((m, i) =>
        console.log(`  ${i + 1}. ${m.emoji}  ${chalk.cyan(m.name.padEnd(22))} ${chalk.dim(m.id)}`)
      );
      console.log();
      break;

    case "skill":
      if      (args[0] === "add"      && args[1]) await fetchSkill(args[1], deps);
      else if (args[0] === "install"  && args[1]) await installNamedSkill(args[1], deps);
      else if (args[0] === "list")   {
        const files = listSkills();
        if (files) {
          console.log(chalk.bold("\n  Installed skills:\n"));
          files.forEach((f) => console.log(`  📄 ${f}`));
          console.log();
        }
      }
      else if (args[0] === "scan"     && args[1]) scanLocalSkill(args[1], deps);
      else if (args[0] === "registry")            showRegistry(deps);
      else {
        console.log(chalk.dim("  /skill list               — installed skills"));
        console.log(chalk.dim("  /skill registry           — browse skills.sh catalog"));
        console.log(chalk.dim("  /skill install <name>     — install by short name"));
        console.log(chalk.dim("  /skill add <url>          — fetch + scan + install from GitHub"));
        console.log(chalk.dim("  /skill scan <file>        — scan a local file\n"));
      }
      break;

    case "search": {
      const q = args.join(" ");
      if (!q) { console.log(chalk.dim("  Usage: /search <query>\n")); break; }
      if (!FIRECRAWL_KEY) { console.log(chalk.red("  FIRECRAWL_KEY not set in .env\n")); break; }
      const sp = ora(`🌐 Searching: ${q}`).start();
      const result = await webSearch(q);
      sp.stop();
      console.log(result ? chalk.cyan("\n  Results:\n") + result + "\n" : chalk.dim("  No results.\n"));
      break;
    }

    case "scrape": {
      const url = args[0];
      if (!url) { console.log(chalk.dim("  Usage: /scrape <url>\n")); break; }
      if (!FIRECRAWL_KEY) { console.log(chalk.red("  FIRECRAWL_KEY not set in .env\n")); break; }
      const sp = ora(`🌐 Scraping ${url}`).start();
      const result = await scrapeUrl(url);
      sp.stop();
      console.log(result ? chalk.cyan("\n  Content:\n") + result + "\n" : chalk.dim("  Could not scrape.\n"));
      break;
    }

    case "history":
      console.log(chalk.dim(`  ${historyStats(history)}\n`));
      break;

    case "keys":
      console.log(chalk.dim(`  ${keyStatus()}\n`));
      break;

    case "rag": {
      const sub = args[0];

      if (sub === "add" && args[1]) {
        const target = args[1];
        const sp = ora(`Indexing ${target}…`).start();
        try {
          const stat = fs.statSync(target);
          if (stat.isDirectory()) {
            const results = await ingestDir(target);
            sp.stop();
            results.forEach((r) => console.log(chalk.green(`  ✓ ${r.source}  (${r.chunks} chunks)`)));
          } else {
            const result = await ingest(target);
            sp.stop();
            console.log(chalk.green(`  ✓ ${result.source}  (${result.chunks} chunks)`));
          }
        } catch (e) {
          sp.stop();
          console.log(chalk.red(`  Error: ${e.message}`));
        }
        console.log();

      } else if (sub === "list") {
        const docs = await listDocuments();
        if (!docs.length) { console.log(chalk.dim("  No documents indexed yet.\n")); break; }
        console.log(chalk.bold("\n  Indexed documents:\n"));
        docs.forEach((d) => console.log(`  📄 ${chalk.cyan(d.source.padEnd(30))} ${chalk.dim(d.chunks + " chunks")}`));
        console.log();

      } else if (sub === "search" && args[1]) {
        const query = args.slice(1).join(" ");
        const sp = ora("Searching…").start();
        const chunks = await retrieve(query, 5, 0.3);
        sp.stop();
        if (!chunks.length) { console.log(chalk.dim("  No results.\n")); break; }
        console.log(chalk.bold(`\n  Top ${chunks.length} results for "${query}":\n`));
        chunks.forEach((c) => {
          console.log(`  ${chalk.cyan(`[${c.source} · ${c.score}%]`)}`);
          console.log(chalk.dim(`  ${c.text.slice(0, 200).replace(/\n/g, " ")}…\n`));
        });

      } else if (sub === "clear") {
        await clearIndex();
        console.log(chalk.green("  ✓ RAG index cleared.\n"));

      } else {
        console.log(chalk.dim("  /rag add <file|dir>   — index a file or folder"));
        console.log(chalk.dim("  /rag list             — show indexed documents"));
        console.log(chalk.dim("  /rag search <query>   — test retrieval"));
        console.log(chalk.dim("  /rag clear            — wipe the index\n"));
      }
      break;
    }

    case "cai":
      printCAIRef();
      break;

    case "help":
      printHelp();
      break;

    case "exit":
    case "quit":
      console.log(chalk.red("\nGoodbye!\n"));
      process.exit(0);

    default:
      console.log(chalk.red(`  Unknown: /${cmd}  — type /help\n`));
  }
}

// ── Display ───────────────────────────────────────────────────────────────────
function printCAIRef() {
  console.log(`
${chalk.bold.red("  ☠  CAI — Cybersecurity AI Framework (aliasrobotics/CAI)")}

${chalk.bold("  Kill-chain phases:")}
  ${chalk.cyan("recon")}      nmap, masscan, gobuster, amass, shodan
  ${chalk.cyan("exploit")}    sqlmap, Metasploit, searchsploit, Burp
  ${chalk.cyan("privesc")}    LinPEAS, WinPEAS, SUID/sudo/cron/token abuse
  ${chalk.cyan("lateral")}    Impacket, BloodHound, CrackMapExec, Mimikatz
  ${chalk.cyan("exfil")}      DNS/HTTPS channels, staging + encrypt
  ${chalk.cyan("c2")}         Metasploit handler, Covenant, persistence

${chalk.bold("  CTF: ")} web · pwn · crypto · forensics · rev · steg

${chalk.bold("  Quick recon:")}
  ${chalk.dim("nmap -sV -sC -p- --min-rate 5000 <target>")}
  ${chalk.dim("gobuster dir -u http://<t> -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt")}

${chalk.dim("  Source: https://github.com/aliasrobotics/CAI")}
`);
}

function printHelp() {
  console.log(`
${chalk.bold("Commands:")}
  ${chalk.cyan("/search <query>")}         web search via Firecrawl
  ${chalk.cyan("/scrape <url>")}           scrape a URL
  ${chalk.cyan("/model")}                  show model priority chain
  ${chalk.cyan("/skill list")}             installed skills
  ${chalk.cyan("/skill registry")}         browse skills.sh catalog
  ${chalk.cyan("/skill install <name>")}   install by short name
  ${chalk.cyan("/skill add <url>")}        fetch + scan + install from GitHub
  ${chalk.cyan("/skill scan <file>")}      scan a local skill file for threats
  ${chalk.cyan("/rag add <file|dir>")}     index a file or folder into local RAG
  ${chalk.cyan("/rag list")}              show indexed documents
  ${chalk.cyan("/rag search <query>")}    test retrieval without AI
  ${chalk.cyan("/rag clear")}             wipe the index
  ${chalk.cyan("/cai")}                   CAI cybersecurity quick-ref
  ${chalk.cyan("/keys")}                   key rotation status
  ${chalk.cyan("/history")}                conversation stats
  ${chalk.cyan("/clear")}                  clear history (memory + disk)
  ${chalk.cyan("/help")}                   this help
  ${chalk.cyan("/exit")}                   quit

${chalk.bold("Auto-triggers (no command needed):")}
  Paste a URL in your message          → Firecrawl scrapes it
  Say search/find/latest/what is…      → Firecrawl web search

${chalk.bold("Skill Sentinel — every /skill add is auto-scanned:")}
  ${chalk.red("CRITICAL")} = blocked · ${chalk.yellow("HIGH/MEDIUM")} = warned, your choice
`);
}

function printBanner() {
  console.log(chalk.cyan(figlet.textSync("JARVIS", { font: "Slant" })));
  const skillCount    = fs.existsSync(SKILLS_DIR) ? fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md")).length : 0;
  const triggerCount  = Object.keys(SKILL_TRIGGERS).length;
  const webStatus     = FIRECRAWL_KEY ? chalk.green("Firecrawl ✓") : chalk.dim("Firecrawl ✗");
  const historyTurns  = history.filter((m) => m.role === "user").length;
  console.log(
    chalk.dim(`  ${MODEL_CHAIN.length} models · `) +
    chalk.green(`${skillCount} skills`) +
    chalk.dim(` · ${triggerCount} triggers · `) +
    webStatus +
    chalk.dim(` · Skill Sentinel · RAG · ${KEYS.length} keys`) +
    (historyTurns ? chalk.dim(` · ${historyTurns} turns restored`) : "") +
    "\n"
  );
}

// ── REPL ──────────────────────────────────────────────────────────────────────
async function main() {
  console.clear();
  printBanner();

  while (true) {
    const input = readlineSync.question(chalk.blue("You > ")).trim();
    if (!input) continue;
    if (input.startsWith("/")) await handleCommand(input);
    else                        await askAI(input);
  }
}

main();
