import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const LOG_DIR = process.env.JARVIS_MEMORY_PATH ?? path.join(os.homedir(), ".jarvis-unified");
const SERVER_LOG = path.join(LOG_DIR, "server.log");

export async function isServerOnline(port = Number(process.env.PORT ?? 3000)) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureServer({ port = Number(process.env.PORT ?? 3000), host = process.env.HOST ?? "127.0.0.1" } = {}) {
  if (await isServerOnline(port)) return { started: false, online: true, url: `http://${host}:${port}` };

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const out = fs.openSync(SERVER_LOG, "a");
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, PORT: String(port), HOST: host },
  });
  child.unref();

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (await isServerOnline(port)) return { started: true, online: true, pid: child.pid, url: `http://${host}:${port}`, log: SERVER_LOG };
  }
  return { started: true, online: false, pid: child.pid, url: `http://${host}:${port}`, log: SERVER_LOG };
}

export function getServerLogPath() { return SERVER_LOG; }
