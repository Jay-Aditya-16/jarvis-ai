import { LocalIndex } from "vectra";
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAG_DIR   = path.join(__dirname, "..", ".jarvis-rag");

// Lazy singletons — only load the ~22MB model on first use
let _embedder = null;
let _index    = null;

async function getEmbedder() {
  if (_embedder) return _embedder;
  const { pipeline, env } = await import("@xenova/transformers");
  env.allowLocalModels = false; // always fetch from HuggingFace cache
  _embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  return _embedder;
}

async function getIndex() {
  if (_index) return _index;
  _index = new LocalIndex(RAG_DIR);
  if (!await _index.isIndexCreated()) await _index.createIndex();
  return _index;
}

async function embed(text) {
  const embedder = await getEmbedder();
  const out = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(out.data);
}

// Split into overlapping chunks — paragraph-aware with hard size fallback
function chunkText(text, size = 600, overlap = 100) {
  // Try to split on paragraph breaks first
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > size && current.length > 0) {
      chunks.push(current.trim());
      current = current.slice(-overlap) + "\n\n" + para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Split any chunk still over hard limit
  const final = [];
  for (const c of chunks) {
    if (c.length <= size * 1.5) { final.push(c); continue; }
    for (let i = 0; i < c.length; i += size - overlap) {
      final.push(c.slice(i, i + size));
    }
  }
  return final.filter((c) => c.length > 30);
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function ingest(filePath) {
  const content  = fs.readFileSync(path.resolve(filePath), "utf8");
  const source   = path.basename(filePath);
  const chunks   = chunkText(content);
  const index    = await getIndex();

  // Remove old entries for this source before re-indexing
  const existing = await index.listItems();
  for (const item of existing) {
    if (item.metadata?.source === source) await index.deleteItem(item.id);
  }

  for (let i = 0; i < chunks.length; i++) {
    const vector = await embed(chunks[i]);
    await index.insertItem({
      vector,
      metadata: { text: chunks[i], source, chunk: i, ingested: Date.now() },
    });
  }
  return { source, chunks: chunks.length };
}

export async function ingestDir(dirPath, exts = [".md", ".txt", ".js", ".ts", ".py", ".json"]) {
  const files = fs.readdirSync(dirPath)
    .filter((f) => exts.some((e) => f.endsWith(e)))
    .map((f) => path.join(dirPath, f));
  const results = [];
  for (const f of files) results.push(await ingest(f));
  return results;
}

export async function retrieve(query, topK = 4, minScore = 0.35) {
  const index = await getIndex();
  if (!await index.isIndexCreated()) return [];

  const vector  = await embed(query);
  // vectra v0.15 signature: queryItems(vector, query, topK, filter, isBm25)
  const results = await index.queryItems(vector, undefined, topK);

  return results
    .filter((r) => r.score >= minScore)
    .map((r) => ({
      text:   r.item.metadata.text,
      source: r.item.metadata.source,
      score:  Math.round(r.score * 100),
    }));
}

export async function listDocuments() {
  const index = await getIndex();
  if (!await index.isIndexCreated()) return [];
  const items   = await index.listItems();
  const bySource = {};
  for (const item of items) {
    const src = item.metadata?.source ?? "unknown";
    bySource[src] = (bySource[src] ?? 0) + 1;
  }
  return Object.entries(bySource).map(([source, chunks]) => ({ source, chunks }));
}

export async function clearIndex() {
  if (fs.existsSync(RAG_DIR)) {
    fs.rmSync(RAG_DIR, { recursive: true });
    _index = null;
  }
}

// Format retrieved chunks for injection into the prompt
export function formatContext(chunks) {
  if (!chunks.length) return "";
  return chunks
    .map((c) => `FILE: ${c.source} (relevance ${c.score}%)\n\`\`\`\n${c.text}\n\`\`\``)
    .join("\n\n");
}
