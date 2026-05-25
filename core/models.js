import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

export const KEYS = [
  process.env.OR_KEY_1,
  process.env.OR_KEY_2,
  process.env.OR_KEY_3,
  process.env.OR_KEY_4,
  process.env.OR_KEY_5,
].filter(Boolean);

if (!KEYS.length) {
  console.error("No API keys found. Add OR_KEY_1…OR_KEY_5 to .env");
  process.exit(1);
}

// Per-key state: track daily exhaustion so we skip known-dead keys
const keyState = KEYS.map(() => ({ exhausted: false, rotations: 0 }));
let keyIndex = 0;

export function getClient() {
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

export function markKeyExhausted() {
  const idx = (keyIndex - 1 + KEYS.length) % KEYS.length;
  keyState[idx].exhausted = true;
  keyState[idx].rotations++;
}

export function keyStatus() {
  const active  = keyIndex % KEYS.length + 1;
  const dead    = keyState.filter((k) => k.exhausted).length;
  const rotations = keyState.reduce((s, k) => s + k.rotations, 0);
  return `${KEYS.length} keys · active: key ${active} · exhausted: ${dead} · rotations: ${rotations}`;
}

// ── Models ─────────────────────────────────────────────────────────────────────
export const MODEL_CHAIN = [
  { id: "openai/gpt-oss-120b:free",               name: "GPT-OSS 120B",     emoji: "🔥", role: "reasoning" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron Super",   emoji: "🧠", role: "reasoning" },
  { id: "poolside/laguna-m.1:free",               name: "Laguna M.1",       emoji: "💻", role: "coding"    },
  { id: "arcee-ai/trinity-large-thinking:free",   name: "Trinity Thinking", emoji: "💭", role: "thinking"  },
  { id: "google/gemma-4-31b-it:free",             name: "Gemma 4 31B",      emoji: "✨", role: "general"   },
  { id: "qwen/qwen3-coder:free",                  name: "Qwen3 Coder",      emoji: "🐉", role: "coding"    },
  { id: "deepseek/deepseek-v4-flash:free",        name: "DeepSeek Flash",   emoji: "⚡", role: "fast"      },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B",   emoji: "🦙", role: "general"   },
];

// ── Routing ────────────────────────────────────────────────────────────────────
const ROUTE = [
  { role: "coding",    pattern: /\b(code|debug|fix|bug|build|implement|refactor|optimize|function|class|api|backend|frontend|docker|git|sql|python|javascript|typescript|rust|golang|bash|script|error|syntax|deploy|npm|pip|import)\b/i },
  { role: "reasoning", pattern: /\b(analyze|reason|architecture|design|strategy|plan|compare|evaluate|system|workflow|explain|understand|tradeoff|performance|security)\b/i },
  { role: "thinking",  pattern: /\b(math|proof|logic|theorem|calculate|derive|step by step|think through|complex problem)\b/i },
];

export function chooseModel(prompt) {
  for (const { role, pattern } of ROUTE) {
    if (pattern.test(prompt)) {
      return MODEL_CHAIN.find((m) => m.role === role) ?? MODEL_CHAIN[0];
    }
  }
  return MODEL_CHAIN[0];
}
