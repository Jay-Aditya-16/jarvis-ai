import { detectSkills } from "../core/skills.js";
import { resolveWebContext } from "../core/web.js";
import { loadHistory, saveHistory } from "../core/memory.js";
import { retrieve, formatContext } from "../core/rag.js";
import { getClientForModel, markKeyExhausted, buildModelQueue, modelAttempts, isCloudNetworkError } from "../core/models.js";
import { getSmallTalkReply } from "../core/input-shortcuts.js";

const BASE_SYSTEM = `You are Jarvis, an advanced AI terminal assistant.
You excel at coding, debugging, shell commands, architecture, AI systems, drones, robotics, cybersecurity, and startup MVPs.
Format code in fenced blocks with language tags. Be concise and precise. Follow instructions exactly.

CRITICAL RULE: When the user's message includes [RAG CONTEXT] or [WEB CONTEXT] sections, answer using that content specifically.`;

export function registerWebSocketChat(wss) {
  wss.on("connection", (ws) => {
    let history = loadHistory();

    ws.on("message", async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type !== "chat" || !msg.message?.trim()) return;

      const userInput = msg.message.trim();
      const send = (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));
      const smallTalk = getSmallTalkReply(userInput);
      if (smallTalk) {
        send({ type: "start", model: "Jarvis" });
        send({ type: "chunk", content: smallTalk });
        send({ type: "done", model: "Jarvis" });
        history.push({ role: "user", content: userInput });
        history.push({ role: "assistant", content: smallTalk });
        saveHistory(history);
        return;
      }
      const skills = detectSkills(userInput);
      const skillBlock = skills.map((s) => s.content).join("\n\n---\n\n");
      const systemPrompt = skillBlock ? `${BASE_SYSTEM}\n\n=== ACTIVE SKILLS ===\n${skillBlock}` : BASE_SYSTEM;

      if (skills.length) send({ type: "status", content: `◈ skills: ${skills.map((s) => s.file.replace(".md", "")).join(" + ")}` });

      const spinner = { set text(v) { send({ type: "status", content: v }); } };
      const [webCtx, ragChunks] = await Promise.all([
        resolveWebContext(userInput, spinner).catch(() => ""),
        retrieve(userInput).catch(() => []),
      ]);

      if (webCtx) send({ type: "status", content: `🌐 web context (${webCtx.length} chars)` });
      if (ragChunks.length) send({ type: "status", content: `◈ rag: ${ragChunks.length} chunks` });

      const ragBlock = ragChunks.length ? `[RAG CONTEXT]\n\n${formatContext(ragChunks)}\n\n[END RAG CONTEXT]` : "";
      const webBlock = webCtx ? `[WEB CONTEXT]\n\n${webCtx}\n\n[END WEB CONTEXT]` : "";
      const userMsg = [userInput, ragBlock, webBlock].filter(Boolean).join("\n\n");
      const queue = buildModelQueue(userInput);

      let replied = false;
      let cloudUnavailable = false;
      for (const model of queue) {
        if (replied) break;
        if (cloudUnavailable && !model.local) continue;
        for (let attempt = 0; attempt < modelAttempts(model); attempt++) {
          try {
            const client = getClientForModel(model);
            const stream = await client.chat.completions.create({
              model: model.id,
              messages: [{ role: "system", content: systemPrompt }, ...history.slice(-20), { role: "user", content: userMsg }],
              stream: true,
              max_tokens: 8192,
              temperature: 0.4,
            });

            send({ type: "status", content: `↳ ${model.emoji} ${model.name}` });
            send({ type: "start", model: model.name });

            let reply = "";
            for await (const chunk of stream) {
              const delta = chunk.choices?.[0]?.delta?.content ?? "";
              if (delta) { send({ type: "chunk", content: delta }); reply += delta; }
            }

            send({ type: "done", model: model.name });
            history.push({ role: "user", content: userInput });
            history.push({ role: "assistant", content: reply });
            saveHistory(history);
            replied = true;
            break;
          } catch (err) {
            const status = err?.status ?? err?.response?.status;
            const isUpstream = err?.error?.metadata?.provider_name;
            if (!model.local && status === 429 && !isUpstream) { markKeyExhausted(); continue; }
            if (!model.local && isCloudNetworkError(err)) { cloudUnavailable = true; break; }
            break;
          }
        }
      }

      if (!replied) send({ type: "error", content: "All models unavailable. Try again shortly." });
    });
  });
}
