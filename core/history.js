import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "..", ".jarvis-history.json");
const MAX_TURNS  = 20; // keep last 20 user+assistant pairs (40 messages)

export function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
      if (Array.isArray(raw)) return raw;
    }
  } catch { /* corrupted file — start fresh */ }
  return [];
}

export function saveHistory(history) {
  try {
    // Trim to last MAX_TURNS pairs before saving
    const trimmed = history.slice(-(MAX_TURNS * 2));
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), "utf8");
  } catch { /* non-fatal */ }
}

export function clearHistory() {
  try { fs.unlinkSync(HISTORY_FILE); } catch { /* already gone */ }
}

export function historyStats(history) {
  const turns = history.filter((m) => m.role === "user").length;
  const persisted = fs.existsSync(HISTORY_FILE);
  return `${turns} turns in memory · ${history.length} messages · ${persisted ? "persisted ✓" : "not saved yet"}`;
}
