import fs   from "fs";
import path from "path";
import os   from "os";
import { fileURLToPath } from "url";
import "./env.js";

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_FILE  = path.join(__dirname, "..", ".jarvis-history.json");
const MEMORY_DIR   = process.env.JARVIS_MEMORY_PATH ?? path.join(os.homedir(), ".jarvis-unified");
const MEMORY_FILE  = path.join(MEMORY_DIR, "memory.json");
const MAX_TURNS    = 20;

function ensureDir() {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function defaultStore() {
  return {
    conversations: [],
    facts: {},
    preferences: {},
    projectFacts: {},
    recurringTasks: [],
    knownCommands: {},
    secrets: {},
    lastUpdated: Date.now(),
  };
}

function normalizeStore(store) {
  return {
    ...defaultStore(),
    ...store,
    facts: store?.facts || {},
    preferences: store?.preferences || {},
    projectFacts: store?.projectFacts || {},
    recurringTasks: store?.recurringTasks || [],
    knownCommands: store?.knownCommands || {},
    secrets: store?.secrets || {},
  };
}

function readStore() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      if (raw.conversations) return normalizeStore(raw);
    }
  } catch {}
  return defaultStore();
}

export function loadHistory() {
  ensureDir();
  // Migrate legacy history on first run
  if (!fs.existsSync(MEMORY_FILE) && fs.existsSync(LEGACY_FILE)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8"));
      if (Array.isArray(legacy)) {
        const store = normalizeStore({ conversations: legacy, lastUpdated: Date.now() });
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

export function getMemoryStore() {
  ensureDir();
  return readStore();
}

export function saveMemoryStore(store) {
  ensureDir();
  const next = normalizeStore(store);
  next.lastUpdated = Date.now();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function updateMemorySection(section, value) {
  const store = readStore();
  if (!(section in store)) throw new Error(`Unknown memory section: ${section}`);
  store[section] = value;
  return saveMemoryStore(store);
}

export function rememberPreference(key, value) {
  const store = readStore();
  store.preferences[key] = value;
  return saveMemoryStore(store);
}

export function rememberProjectFact(projectPath, key, value) {
  const store = readStore();
  store.projectFacts[projectPath] = store.projectFacts[projectPath] || {};
  store.projectFacts[projectPath][key] = value;
  return saveMemoryStore(store);
}

export function rememberKnownCommand(projectPath, name, command) {
  const store = readStore();
  store.knownCommands[projectPath] = store.knownCommands[projectPath] || {};
  store.knownCommands[projectPath][name] = command;
  return saveMemoryStore(store);
}
