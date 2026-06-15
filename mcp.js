#!/usr/bin/env node
import path            from "path";
import { fileURLToPath } from "url";
import dotenv          from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

import { McpServer }          from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z }                  from "zod";

import { webSearch, scrapeUrl }                          from "./core/web.js";
import { retrieve, ingest, formatContext }               from "./core/rag.js";
import { loadHistory, saveHistory }                      from "./core/memory.js";
import { getClient, markKeyExhausted, MODEL_CHAIN, chooseModel } from "./core/models.js";
import { detectSkills }                                  from "./core/skills.js";

const server = new McpServer({ name: "jarvis", version: "1.0.0" });

const BASE_SYSTEM = `You are Jarvis, an advanced AI terminal assistant.
You excel at coding, debugging, shell commands, architecture, AI systems, drones, robotics, cybersecurity, and startup MVPs.
Format code in fenced blocks. Be concise and precise.`;

server.tool("web_search", "Search the web via Firecrawl",
  { query: z.string().describe("Search query") },
  async ({ query }) => {
    const result = await webSearch(query);
    return { content: [{ type: "text", text: result ?? "No results found" }] };
  }
);

server.tool("scrape_url", "Scrape a URL and return its content as markdown",
  { url: z.string().describe("URL to scrape") },
  async ({ url }) => {
    const result = await scrapeUrl(url);
    return { content: [{ type: "text", text: result ?? "Could not scrape" }] };
  }
);

server.tool("rag_query", "Query the Jarvis local knowledge base",
  { query: z.string().describe("Search query"), topK: z.number().optional().default(4) },
  async ({ query, topK }) => {
    const chunks = await retrieve(query, topK);
    if (!chunks.length) return { content: [{ type: "text", text: "No relevant documents found" }] };
    return { content: [{ type: "text", text: formatContext(chunks) }] };
  }
);

server.tool("rag_add", "Index a file into the Jarvis knowledge base",
  { filePath: z.string().describe("Absolute path to file") },
  async ({ filePath }) => {
    const result = await ingest(filePath);
    return { content: [{ type: "text", text: `Indexed ${result.source} (${result.chunks} chunks)` }] };
  }
);

server.tool("jarvis_chat", "Ask Jarvis with full model routing, RAG, and web search",
  { message: z.string().describe("Your message") },
  async ({ message }) => {
    const history    = loadHistory();
    const preferred  = chooseModel(message);
    const skills     = detectSkills(message);
    const skillBlock = skills.map(s => s.content).join("\n\n---\n\n");
    const system     = skillBlock ? `${BASE_SYSTEM}\n\n=== ACTIVE SKILLS ===\n${skillBlock}` : BASE_SYSTEM;
    const ragChunks  = await retrieve(message).catch(() => []);
    const ragCtx     = ragChunks.length ? `[RAG CONTEXT]\n\n${formatContext(ragChunks)}\n\n[END RAG CONTEXT]` : "";
    const userMsg    = [message, ragCtx].filter(Boolean).join("\n\n");
    const queue      = [preferred, ...MODEL_CHAIN.filter(m => m.id !== preferred.id)];

    for (const model of queue) {
      try {
        const client   = getClient();
        const response = await client.chat.completions.create({
          model:       model.id,
          messages:    [{ role: "system", content: system }, ...history.slice(-20), { role: "user", content: userMsg }],
          max_tokens:  8192,
          temperature: 0.4,
        });
        const reply = response.choices[0]?.message?.content ?? "";
        history.push({ role: "user", content: message });
        history.push({ role: "assistant", content: reply });
        saveHistory(history);
        return { content: [{ type: "text", text: reply }] };
      } catch (err) {
        const s = err?.status ?? err?.response?.status;
        if (s === 429) { markKeyExhausted(); continue; }
        continue;
      }
    }
    return { content: [{ type: "text", text: "All models unavailable" }] };
  }
);

server.tool("get_memory", "Get the last 10 turns of Jarvis conversation history",
  {},
  async () => {
    const history = loadHistory();
    const text    = history.slice(-20).map(m => `${m.role}: ${m.content.slice(0, 300)}`).join("\n---\n");
    return { content: [{ type: "text", text: text || "No history yet" }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
