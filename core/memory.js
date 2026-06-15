import fs   from "fs";
import path from "path";
import os   from "os";
import { fileURLToPath } from "url";

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_FILE  = path.join(__dirname, "..", ".jarvis-history.json");
const MEMORY_DIR   = process.env.JARVIS_MEMORY_PATH ?? path.join(os.homedir(), ".jarvis-unified");
const MEMORY_FILE  = path.join(MEMORY_DIR, "memory.json");
const MAX_TURNS    = 20;

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function readStore() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      if (raw.conversations) return raw;
    }
  } catch {}
  return { conversations: [], facts: {}, lastUpdated: Date.now() };
}

export function loadHistory() {
  ensureDir();
  // Migrate legacy history on first run
  if (!fs.existsSync(MEMORY_FILE) && fs.existsSync(LEGACY_FILE)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8"));
      if (Array.isArray(legacy)) {
        const store = { conversations: legacy, facts: {}, lastUpdated: Date.now() };
        fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2), "utf8");
        return legacy;
      }
    } catch {}
  }
  return readStore().conversations;
}

export function saveHistory(history) {
  try {
    ensureDir();
    const store        = readStore();
    store.conversations = history.slice(-(MAX_TURNS * 2));
    store.lastUpdated  = Date.now();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch {}
}

export function clearHistory() {
  try {
    ensureDir();
    const store        = readStore();
    store.conversations = [];
    store.lastUpdated  = Date.now();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch {}
}

export function historyStats(history) {
  const turns = history.filter(m => m.role === "user").length;
  return `${turns} turns · ${history.length} messages · unified @ ${MEMORY_FILE}`;
}

export function getMemoryPath() { return MEMORY_FILE; }
