import { getClientForModel, markKeyExhausted, buildModelQueue, modelAttempts } from "../core/models.js";

export function registerOpenAIProxy(app) {
  app.get("/v1/models", (_, res) => {
    res.json({
      object: "list",
      data: [{ id: "jarvis", object: "model", created: Math.floor(Date.now() / 1000), owned_by: "jarvis" }],
    });
  });

  app.post("/v1/chat/completions", async (req, res) => {
    const { messages = [], stream = false } = req.body;
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const queue = buildModelQueue(lastUser);

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      for (const model of queue) {
        for (let attempt = 0; attempt < modelAttempts(model); attempt++) {
          try {
            const client = getClientForModel(model);
            const aiStream = await client.chat.completions.create({
              model: model.id,
              messages,
              stream: true,
              max_tokens: 8192,
              temperature: 0.4,
            });
            for await (const chunk of aiStream) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            res.write("data: [DONE]\n\n");
            return res.end();
          } catch (err) {
            const status = err?.status ?? err?.response?.status;
            const isUpstream = err?.error?.metadata?.provider_name;
            if (!model.local && status === 429 && !isUpstream) { markKeyExhausted(); continue; }
            break;
          }
        }
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    for (const model of queue) {
      for (let attempt = 0; attempt < modelAttempts(model); attempt++) {
        try {
          const client = getClientForModel(model);
          const response = await client.chat.completions.create({
            model: model.id,
            messages,
            max_tokens: 8192,
            temperature: 0.4,
          });
          return res.json(response);
        } catch (err) {
          const status = err?.status ?? err?.response?.status;
          const isUpstream = err?.error?.metadata?.provider_name;
          if (!model.local && status === 429 && !isUpstream) { markKeyExhausted(); continue; }
          break;
        }
      }
    }
    res.status(503).json({ error: { message: "All models unavailable", type: "server_error" } });
  });
}
