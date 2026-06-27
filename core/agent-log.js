import fs from "fs";
import path from "path";
import os from "os";

const ROOT = process.env.JARVIS_MEMORY_PATH ?? path.join(os.homedir(), ".jarvis-unified");
const LOG_FILE = path.join(ROOT, "agent-runs.jsonl");

function ensureDir() {
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
}

export function logEvent(type, data = {}) {
  try {
    ensureDir();
    const event = { type, time: new Date().toISOString(), ...data };
    fs.appendFileSync(LOG_FILE, JSON.stringify(event) + "\n", "utf8");
    return event;
  } catch {
    return null;
  }
}

export function readEvents(limit = 100) {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return fs.readFileSync(LOG_FILE, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try { return JSON.parse(line); } catch { return { type: "invalid", raw: line }; }
      });
  } catch {
    return [];
  }
}

export function getLogPath() { return LOG_FILE; }
