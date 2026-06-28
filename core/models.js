import OpenAI from "openai";
import "./env.js";
import { getLocalModelPlan, listInstalledOllamaModels } from "./local-ai.js";
import { classifyPrompt, chooseModelFromCatalog, buildModelQueueFromCatalog } from "./model-router.js";

export const KEYS = [
  process.env.OR_KEY_1,
  process.env.OR_KEY_2,
  process.env.OR_KEY_3,
  process.env.OR_KEY_4,
  process.env.OR_KEY_5,
].filter(Boolean);

const ollamaClient = new OpenAI({ baseURL: "http://127.0.0.1:11434/v1", apiKey: "ollama" });

if (!KEYS.length) {
  console.warn("No OpenRouter keys found. Cloud models disabled; Jarvis will use local Ollama fallback if available.");
}

// Per-key state: track daily exhaustion so we skip known-dead keys
const keyState = KEYS.map(() => ({ exhausted: false, rotations: 0 }));
let keyIndex = 0;

export function getClient() {
  if (!KEYS.length) throw new Error("No OpenRouter API keys configured");
  // Skip keys marked exhausted; if all exhausted, reset and try anyway
  const start = keyIndex;
  do {
    if (!keyState[keyIndex % KEYS.length].exhausted) break;
    keyIndex++;
  } while (keyIndex % KEYS.length !== start % KEYS.length);

  const idx = keyIndex % KEYS.length;
  keyIndex++;
  return new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: KEYS[idx] });
}

export function getClientForModel(model) {
  return model.local ? ollamaClient : getClient();
}

export function markKeyExhausted() {
  if (!KEYS.length) return;
  const idx = (keyIndex - 1 + KEYS.length) % KEYS.length;
  keyState[idx].exhausted = true;
  keyState[idx].rotations++;
}

export function keyStatus() {
  if (!KEYS.length) return "0 cloud keys · local fallback only";
  const active  = keyIndex % KEYS.length + 1;
  const dead    = keyState.filter((k) => k.exhausted).length;
  const rotations = keyState.reduce((s, k) => s + k.rotations, 0);
  return `${KEYS.length} keys · active: key ${active} · exhausted: ${dead} · rotations: ${rotations}`;
}

// ── Models ─────────────────────────────────────────────────────────────────────
export const CLOUD_MODELS = [
  { id: "qwen/qwen3-coder:free",                  name: "Qwen3 Coder",      emoji: "🐉", role: "coding",    priority: 100 },
  { id: "poolside/laguna-m.1:free",               name: "Laguna M.1",       emoji: "💻", role: "coding",    priority: 90 },
  { id: "openai/gpt-oss-120b:free",               name: "GPT-OSS 120B",     emoji: "🔥", role: "reasoning", priority: 100 },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron Super",   emoji: "🧠", role: "reasoning", priority: 90 },
  { id: "arcee-ai/trinity-large-thinking:free",   name: "Trinity Thinking", emoji: "💭", role: "thinking",  priority: 100 },
  { id: "deepseek/deepseek-v4-flash:free",        name: "DeepSeek Flash",   emoji: "⚡", role: "fast",      priority: 100 },
  { id: "google/gemma-4-31b-it:free",             name: "Gemma 4 31B",      emoji: "✨", role: "general",   priority: 90 },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B",    emoji: "🦙", role: "general",   priority: 80 },
];

export const LOCAL_MODELS = getLocalModelPlan().safe.map((model) => ({
  id: model.id,
  name: model.name,
  emoji: "🏠",
  role: model.role,
  local: true,
  priority: model.priority,
  sizeGb: model.sizeGb,
}));

export const MODEL_CHAIN = [...CLOUD_MODELS, ...LOCAL_MODELS]
  .sort((a, b) => (b.priority || 0) - (a.priority || 0));

export function chooseModel(prompt) {
  return chooseModelFromCatalog(prompt, MODEL_CHAIN, { hasCloud: KEYS.length > 0 });
}

export function buildModelQueue(prompt, options = {}) {
  return buildModelQueueFromCatalog(prompt, MODEL_CHAIN, { hasCloud: KEYS.length > 0, ...options });
}

export function modelAttempts(model) {
  if (model.local) return 1;
  if (!KEYS.length) return 0;
  return Math.max(1, Math.min(KEYS.length, Number(process.env.JARVIS_KEY_ATTEMPTS || 2)));
}

export function isCloudNetworkError(err) {
  const text = `${err?.code || ""} ${err?.message || ""} ${err?.cause?.code || ""}`.toLowerCase();
  return !err?.status && /(fetch failed|network|enotfound|econnreset|econnrefused|etimedout|socket|offline|getaddrinfo)/i.test(text);
}

export function routeInfo(prompt) {
  return {
    route: classifyPrompt(prompt),
    queue: buildModelQueue(prompt).map((model) => ({
      id: model.id,
      name: model.name,
      role: model.role,
      local: !!model.local,
      sizeGb: model.sizeGb,
    })),
  };
}

export async function localModelStatus() {
  const plan = getLocalModelPlan();
  const installed = await listInstalledOllamaModels();
  const installedSet = new Set(installed);
  return {
    ...plan,
    installed,
    safe: plan.safe.map((model) => ({ ...model, installed: installedSet.has(model.id) })),
  };
}
