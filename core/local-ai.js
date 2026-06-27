import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const LOCAL_PROFILE = process.env.JARVIS_LOCAL_PROFILE || "m1-8gb";
export const LOCAL_MAX_MODEL_GB = Number(process.env.JARVIS_LOCAL_MAX_MODEL_GB || 3.6);

export const LOCAL_MODEL_CANDIDATES = [
  {
    id: "qwen2.5:3b",
    name: "Qwen2.5 3B (local)",
    role: "coding",
    family: "qwen",
    sizeGb: 1.9,
    priority: 10,
    reason: "best default local coding/general fallback under the M1 8GB budget",
  },
  {
    id: "phi3.5:latest",
    name: "Phi 3.5 Mini (local)",
    role: "reasoning",
    family: "phi",
    sizeGb: 2.2,
    priority: 9,
    reason: "strong compact reasoning fallback",
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B (local)",
    role: "general",
    family: "llama",
    sizeGb: 2.0,
    priority: 8,
    reason: "stable small general chat fallback",
  },
  {
    id: "gemma3n:e2b",
    name: "Gemma 3n E2B (local)",
    role: "fast",
    family: "gemma",
    sizeGb: 2.0,
    priority: 7,
    reason: "efficient everyday-device fallback",
  },
  {
    id: "gemma3:1b",
    name: "Gemma 3 1B (local)",
    role: "fast",
    family: "gemma",
    sizeGb: 0.9,
    priority: 6,
    reason: "very small emergency fallback",
  },
  {
    id: "gemma3:4b",
    name: "Gemma 3 4B (local optional)",
    role: "general",
    family: "gemma",
    sizeGb: 3.3,
    priority: 4,
    optional: true,
    reason: "higher quality but closer to the 8GB RAM comfort limit",
  },
];

export function detectLocalMachine() {
  const totalRamGb = +(os.totalmem() / 1024 ** 3).toFixed(1);
  return {
    platform: os.platform(),
    arch: os.arch(),
    totalRamGb,
    profile: LOCAL_PROFILE,
    appleSilicon: os.platform() === "darwin" && os.arch() === "arm64",
    lowMemory: totalRamGb <= 9,
  };
}

export function getLocalModelPlan() {
  const machine = detectLocalMachine();
  const maxGb = machine.lowMemory ? Math.min(LOCAL_MAX_MODEL_GB, 3.6) : LOCAL_MAX_MODEL_GB;
  const safe = LOCAL_MODEL_CANDIDATES
    .filter((model) => model.sizeGb <= maxGb)
    .filter((model) => !model.optional || process.env.JARVIS_LOCAL_INCLUDE_OPTIONAL === "1")
    .sort((a, b) => b.priority - a.priority);

  return {
    machine,
    maxModelGb: maxGb,
    safe,
    optional: LOCAL_MODEL_CANDIDATES.filter((model) => model.optional || model.sizeGb > maxGb),
    install: safe.map((model) => `ollama pull ${model.id}`),
  };
}

export async function isOllamaAvailable() {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listInstalledOllamaModels() {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      const data = await res.json();
      return (data.models || []).map((m) => m.name);
    }
  } catch {}

  try {
    const { stdout } = await execFileAsync("ollama", ["list"], { timeout: 2000 });
    return stdout.split(/\r?\n/).slice(1).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean);
  } catch {
    return [];
  }
}
