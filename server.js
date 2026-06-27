#!/usr/bin/env node
import express              from "express";
import { WebSocketServer }  from "ws";
import { createServer }     from "http";
import path                 from "path";
import { fileURLToPath }    from "url";
import chalk                from "chalk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { KEYS, getClient, getClientForModel, markKeyExhausted, MODEL_CHAIN, chooseModel } from "./core/models.js";
import { detectSkills }                                                  from "./core/skills.js";
import { resolveWebContext, webSearch, scrapeUrl, FIRECRAWL_KEY }       from "./core/web.js";
import { loadHistory, saveHistory, clearHistory, getMemoryPath, getMemoryStore, updateMemorySection } from "./core/memory.js";
import { retrieve, ingest, listDocuments, formatContext }               from "./core/rag.js";
import { scanProject, formatProjectContext }                            from "./core/project.js";
import { readWorld, getWorldPath }                                      from "./core/world.js";
import { readEvents, getLogPath }                                       from "./core/agent-log.js";
import { listTasks, createTask, updateTask }                            from "./core/tasks.js";
import { listMcpServers }                                               from "./core/mcp-loader.js";
import { browserSnapshot }                                              from "./core/browser.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server, path: "/ws" });

app.use(express.json());
app.use(express.static(path.join(__dirname, "web")));

// ── OpenAI-compatible proxy (for OpenClaw) ────────────────────────────────────
app.get("/v1/models", (_, res) => {
  res.json({
    object: "list",
    data: [{ id: "jarvis", object: "model", created: Math.floor(Date.now()/1000), owned_by: "jarvis" }],
  });
});

app.post("/v1/chat/completions", async (req, res) => {
  const { messages = [], stream = false } = req.body;
  const lastUser = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
  const preferred = chooseModel(lastUser);
  const queue     = [preferred, ...MODEL_CHAIN.filter(m => m.id !== preferred.id)];

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    for (const model of queue) {
      try {
        const client    = getClientForModel(model);
        const aiStream  = await client.chat.completions.create({ model: model.id, messages, stream: true, max_tokens: 8192, temperature: 0.4 });
        for await (const chunk of aiStream) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      } catch (err) {
        const s = err?.status ?? err?.response?.status;
        if (!model.local && s === 429 && !err?.error?.metadata?.provider_name) { markKeyExhausted(); }
        continue;
      }
    }
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  for (const model of queue) {
    try {
      const client   = getClientForModel(model);
      const response = await client.chat.completions.create({ model: model.id, messages, max_tokens: 8192, temperature: 0.4 });
      return res.json(response);
    } catch (err) {
      const s = err?.status ?? err?.response?.status;
      if (!model.local && s === 429 && !err?.error?.metadata?.provider_name) { markKeyExhausted(); }
      continue;
    }
  }
  res.status(503).json({ error: { message: "All models unavailable", type: "server_error" } });
});

// ── REST API ──────────────────────────────────────────────────────────────────
app.post("/api/search", async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "query required" });
  res.json({ result: await webSearch(query) ?? "No results" });
});

app.post("/api/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });
  res.json({ result: await scrapeUrl(url) ?? "Could not scrape" });
});

app.post("/api/rag/query", async (req, res) => {
  const { query, topK = 4 } = req.body;
  if (!query) return res.status(400).json({ error: "query required" });
  res.json({ chunks: await retrieve(query, topK) });
});

app.post("/api/rag/add", async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: "filePath required" });
  res.json(await ingest(filePath));
});

app.get("/api/memory", (_, res) => {
  res.json({ store: getMemoryStore(), path: getMemoryPath() });
});

app.patch("/api/memory/:section", (req, res) => {
  try {
    res.json({ store: updateMemorySection(req.params.section, req.body?.value) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/memory", (_, res) => {
  clearHistory();
  res.json({ ok: true });
});

app.get("/api/project", async (_, res) => {
  const project = await scanProject(process.cwd()).catch((e) => ({ error: e.message }));
  res.json({ project, formatted: formatProjectContext(project) });
});

app.get("/api/world", (_, res) => {
  res.json({ world: readWorld(), path: getWorldPath() });
});

app.get("/api/logs", (req, res) => {
  res.json({ events: readEvents(Number(req.query.limit || 100)), path: getLogPath() });
});

app.get("/api/tasks", (_, res) => {
  res.json({ tasks: listTasks() });
});

app.post("/api/tasks", (req, res) => {
  if (!req.body?.title) return res.status(400).json({ error: "title required" });
  res.json({ task: createTask(req.body.title, req.body.details || {}) });
});

app.patch("/api/tasks/:id", (req, res) => {
  const task = updateTask(req.params.id, req.body || {});
  if (!task) return res.status(404).json({ error: "task not found" });
  res.json({ task });
});

app.get("/api/mcp", (_, res) => {
  res.json({ servers: listMcpServers(process.cwd()) });
});

app.post("/api/browser/snapshot", async (req, res) => {
  if (!req.body?.url) return res.status(400).json({ error: "url required" });
  res.json(await browserSnapshot(req.body.url));
});

app.get("/api/status", async (_, res) => {
  res.json({
    keys: KEYS.length,
    models: MODEL_CHAIN.length,
    firecrawl: !!FIRECRAWL_KEY,
    memoryPath: getMemoryPath(),
    worldPath: getWorldPath(),
    logPath: getLogPath(),
    docs: await listDocuments(),
  });
});

// ── WebSocket streaming chat ──────────────────────────────────────────────────
const BASE_SYSTEM = `You are Jarvis, an advanced AI terminal assistant.
You excel at coding, debugging, shell commands, architecture, AI systems, drones, robotics, cybersecurity, and startup MVPs.
Format code in fenced blocks with language tags. Be concise and precise. Follow instructions exactly.

CRITICAL RULE: When the user's message includes [RAG CONTEXT] or [WEB CONTEXT] sections, answer using that content specifically.`;

wss.on("connection", (ws) => {
  let history = loadHistory();

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type !== "chat" || !msg.message?.trim()) return;

    const userInput = msg.message.trim();
    const send      = obj => ws.readyState === 1 && ws.send(JSON.stringify(obj));

    const preferred = chooseModel(userInput);
    const skills    = detectSkills(userInput);
    const skillBlock = skills.map(s => s.content).join("\n\n---\n\n");
    const systemPrompt = skillBlock ? `${BASE_SYSTEM}\n\n=== ACTIVE SKILLS ===\n${skillBlock}` : BASE_SYSTEM;

    if (skills.length) send({ type: "status", content: `◈ skills: ${skills.map(s => s.file.replace(".md","")).join(" + ")}` });

    // Fake spinner that sends status messages to websocket
    const spinner = { set text(v) { send({ type: "status", content: v }); } };

    const [webCtx, ragChunks] = await Promise.all([
      resolveWebContext(userInput, spinner).catch(() => ""),
      retrieve(userInput).catch(() => []),
    ]);

    if (webCtx)           send({ type: "status", content: `🌐 web context (${webCtx.length} chars)` });
    if (ragChunks.length) send({ type: "status", content: `◈ rag: ${ragChunks.length} chunks` });

    const ragBlock  = ragChunks.length ? `[RAG CONTEXT]\n\n${formatContext(ragChunks)}\n\n[END RAG CONTEXT]` : "";
    const webBlock  = webCtx           ? `[WEB CONTEXT]\n\n${webCtx}\n\n[END WEB CONTEXT]` : "";
    const userMsg   = [userInput, ragBlock, webBlock].filter(Boolean).join("\n\n");
    const queue     = [preferred, ...MODEL_CHAIN.filter(m => m.id !== preferred.id)];

    let replied = false;
    for (const model of queue) {
      if (replied) break;
      const attempts = model.local ? 1 : KEYS.length;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const client = getClientForModel(model);
          const stream = await client.chat.completions.create({
            model:       model.id,
            messages:    [{ role: "system", content: systemPrompt }, ...history.slice(-20), { role: "user", content: userMsg }],
            stream:      true,
            max_tokens:  8192,
            temperature: 0.4,
          });

          if (model.id !== preferred.id) send({ type: "status", content: `⟳ ${model.emoji} ${model.name}` });
          send({ type: "start", model: model.name });

          let reply = "";
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            if (delta) { send({ type: "chunk", content: delta }); reply += delta; }
          }

          send({ type: "done", model: model.name });
          history.push({ role: "user", content: userInput });
          history.push({ role: "assistant", content: reply });
          saveHistory(history);
          replied = true;
          break;
        } catch (err) {
          const s          = err?.status ?? err?.response?.status;
          const isUpstream = err?.error?.metadata?.provider_name;
          if (!model.local && s === 429 && isUpstream)  break;
          if (!model.local && s === 429 && !isUpstream) { markKeyExhausted(); continue; }
          break;
        }
      }
    }

    if (!replied) send({ type: "error", content: "All models unavailable. Try again shortly." });
  });
});

function handleListenError(err) {
  const bind = `${HOST}:${PORT}`;
  if (err.code === "EADDRINUSE") {
    console.error(chalk.red(`\n  Port already in use: ${bind}`));
    console.error(chalk.dim("  Set PORT=3001 or stop the existing server.\n"));
  } else if (err.code === "EPERM") {
    console.error(chalk.red(`\n  Cannot bind server on ${bind}`));
    console.error(chalk.dim("  Check terminal/network permissions or try another PORT/HOST.\n"));
  } else {
    console.error(chalk.red(`\n  Server error: ${err.message}\n`));
  }
  process.exit(1);
}

server.on("error", handleListenError);
wss.on("error", handleListenError);

server.listen(PORT, HOST, () => {
  const urlHost = HOST === "127.0.0.1" ? "localhost" : HOST;
  console.log(chalk.cyan(`\n  Jarvis     ->  http://${urlHost}:${PORT}`));
  console.log(chalk.dim(`  WebSocket  ->  ws://${urlHost}:${PORT}/ws`));
  console.log(chalk.dim(`  OpenAI API ->  http://${urlHost}:${PORT}/v1`));
  console.log(chalk.dim(`  Memory     ->  ${getMemoryPath()}\n`));
});
