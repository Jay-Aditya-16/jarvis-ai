#!/usr/bin/env node
import express              from "express";
import { WebSocketServer }  from "ws";
import { createServer }     from "http";
import path                 from "path";
import { fileURLToPath }    from "url";
import chalk                from "chalk";
import dotenv               from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

import { KEYS, getClient, getClientForModel, markKeyExhausted, MODEL_CHAIN, chooseModel } from "./core/models.js";
import { detectSkills }                                                  from "./core/skills.js";
import { resolveWebContext, webSearch, scrapeUrl, FIRECRAWL_KEY }       from "./core/web.js";
import { loadHistory, saveHistory, clearHistory, getMemoryPath }        from "./core/memory.js";
import { retrieve, ingest, listDocuments, formatContext }               from "./core/rag.js";

const PORT = process.env.PORT ?? 3000;
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
  res.json({ history: loadHistory(), path: getMemoryPath() });
});

app.delete("/api/memory", (_, res) => {
  clearHistory();
  res.json({ ok: true });
});

app.get("/api/status", async (_, res) => {
  res.json({ keys: KEYS.length, models: MODEL_CHAIN.length, firecrawl: !!FIRECRAWL_KEY, memoryPath: getMemoryPath(), docs: await listDocuments() });
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

server.listen(PORT, () => {
  console.log(chalk.cyan(`\n  🤖 Jarvis  →  http://localhost:${PORT}`));
  console.log(chalk.dim(`  WebSocket  →  ws://localhost:${PORT}/ws`));
  console.log(chalk.dim(`  OpenAI API →  http://localhost:${PORT}/v1`));
  console.log(chalk.dim(`  Memory     →  ${getMemoryPath()}\n`));
});
