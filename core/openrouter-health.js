import { KEYS, CLOUD_MODELS } from "./models.js";

const DEFAULT_CHAT_MODEL = process.env.JARVIS_KEY_TEST_MODEL || "google/gemma-4-31b-it:free";

function timeout(ms) {
  return AbortSignal.timeout(ms);
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

function keyName(index) {
  return `OR_KEY_${index + 1}`;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  return { res, body: parseJson(text), text };
}

export async function validateOpenRouterKeys(options = {}) {
  const model = options.model || DEFAULT_CHAT_MODEL;
  const chat = options.chat !== false;
  const results = [];

  for (const [index, key] of KEYS.entries()) {
    const result = { key: keyName(index), auth: null, chat: null };

    try {
      const { res, body, text } = await requestJson("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${key}` },
        signal: timeout(options.authTimeoutMs || 20000),
      });
      const data = body?.data || body || {};
      result.auth = {
        ok: res.ok,
        status: res.status,
        usage: data.usage ?? null,
        limit: data.limit ?? null,
        isFreeTier: data.is_free_tier ?? null,
        error: res.ok ? null : (body?.error?.message || body?.message || text.slice(0, 180)),
      };
    } catch (e) {
      result.auth = { ok: false, error: e.message };
    }

    if (chat) {
      try {
        const { res, body, text } = await requestJson("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Jarvis key validation",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Reply with exactly: ok" }],
            max_tokens: 8,
            temperature: 0,
          }),
          signal: timeout(options.chatTimeoutMs || 30000),
        });
        result.chat = {
          ok: res.ok,
          status: res.status,
          model: body?.model || model,
          content: body?.choices?.[0]?.message?.content?.slice(0, 60) || null,
          error: res.ok ? null : (body?.error?.message || body?.message || text.slice(0, 220)),
        };
      } catch (e) {
        result.chat = { ok: false, error: e.message };
      }
    }

    results.push(result);
  }

  const authOk = results.length > 0 && results.every((item) => item.auth?.ok);
  const usableKeys = results.filter((item) => item.auth?.ok && (!chat || item.chat?.ok)).length;
  const chatOk = !chat || usableKeys === results.length;

  return {
    configuredKeys: KEYS.length,
    testModel: model,
    keys: results,
    authOk,
    chatOk,
    usableKeys,
    ok: authOk && usableKeys > 0,
  };
}

export async function validateCloudModels(options = {}) {
  if (!KEYS.length) return { ok: false, error: "No OpenRouter keys configured", models: [] };
  const key = KEYS[options.keyIndex || 0];
  const models = [];

  for (const model of CLOUD_MODELS) {
    const result = { id: model.id, name: model.name, role: model.role, roles: model.roles, ok: false, status: null, error: null, content: null };
    try {
      const { res, body, text } = await requestJson("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Jarvis model validation",
        },
        body: JSON.stringify({
          model: model.id,
          messages: [{ role: "user", content: "Reply with exactly: ok" }],
          max_tokens: 8,
          temperature: 0,
        }),
        signal: timeout(options.timeoutMs || 35000),
      });
      result.ok = res.ok;
      result.status = res.status;
      result.content = body?.choices?.[0]?.message?.content?.slice(0, 60) || null;
      result.error = res.ok ? null : (body?.error?.message || body?.message || text.slice(0, 220));
    } catch (e) {
      result.error = e.message;
    }
    models.push(result);
  }

  return {
    key: keyName(options.keyIndex || 0),
    ok: models.some((model) => model.ok),
    models,
  };
}
