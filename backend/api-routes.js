import { KEYS, MODEL_CHAIN, routeInfo, localModelStatus } from "../core/models.js";
import { webSearch, scrapeUrl, FIRECRAWL_KEY } from "../core/web.js";
import { loadHistory, clearHistory, getMemoryPath, getMemoryStore, updateMemorySection } from "../core/memory.js";
import { retrieve, ingest, listDocuments } from "../core/rag.js";
import { scanProject, formatProjectContext } from "../core/project.js";
import { readWorld, getWorldPath } from "../core/world.js";
import { readEvents, getLogPath } from "../core/agent-log.js";
import { listTasks, createTask, updateTask } from "../core/tasks.js";
import { listMcpServers } from "../core/mcp-loader.js";
import { browserSnapshot } from "../core/browser.js";
import { lifeSummary, getLifeRoot, formatLifeContext, readLifeFile, appendLifeEntry, createIdealState, createDailyNote, createWeeklyReview } from "../core/life.js";

export function registerApiRoutes(app) {
  app.post("/api/search", async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query required" });
    res.json({ result: await webSearch(query) ?? "No results" });
  });

  app.post("/api/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });
    res.json({ result: await scrapeUrl(url) ?? "Could not scrape" });
  });

  app.post("/api/rag/query", async (req, res) => {
    const { query, topK = 4 } = req.body;
    if (!query) return res.status(400).json({ error: "query required" });
    res.json({ chunks: await retrieve(query, topK) });
  });

  app.post("/api/rag/add", async (req, res) => {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: "filePath required" });
    res.json(await ingest(filePath));
  });

  app.get("/api/memory", (_, res) => {
    res.json({ store: getMemoryStore(), history: loadHistory(), path: getMemoryPath() });
  });

  app.patch("/api/memory/:section", (req, res) => {
    try {
      res.json({ store: updateMemorySection(req.params.section, req.body?.value) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/memory", (_, res) => {
    clearHistory();
    res.json({ ok: true });
  });

  app.get("/api/project", async (_, res) => {
    const project = await scanProject(process.cwd()).catch((e) => ({ error: e.message }));
    res.json({ project, formatted: formatProjectContext(project) });
  });

  app.get("/api/world", (_, res) => {
    res.json({ world: readWorld(), path: getWorldPath() });
  });

  app.get("/api/logs", (req, res) => {
    res.json({ events: readEvents(Number(req.query.limit || 100)), path: getLogPath() });
  });

  app.get("/api/tasks", (_, res) => {
    res.json({ tasks: listTasks() });
  });

  app.post("/api/tasks", (req, res) => {
    if (!req.body?.title) return res.status(400).json({ error: "title required" });
    res.json({ task: createTask(req.body.title, req.body.details || {}) });
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const task = updateTask(req.params.id, req.body || {});
    if (!task) return res.status(404).json({ error: "task not found" });
    res.json({ task });
  });

  app.get("/api/mcp", (_, res) => {
    res.json({ servers: listMcpServers(process.cwd()) });
  });

  app.get("/api/life", (_, res) => {
    res.json({ summary: lifeSummary(), context: formatLifeContext() });
  });

  app.get("/api/life/file", (req, res) => {
    try {
      const filePath = String(req.query.path || "README.md");
      res.type("text/plain").send(readLifeFile(filePath));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/life/entry", (req, res) => {
    try {
      const { section = "LEARNINGS", title = "Note", content = "" } = req.body || {};
      res.json({ entry: appendLifeEntry(section, title, content) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/life/ideal", (req, res) => {
    try {
      const { title, currentState = "", idealState = "", criteria = [] } = req.body || {};
      if (!title) return res.status(400).json({ error: "title required" });
      res.json({ ideal: createIdealState(title, currentState, idealState, criteria) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/life/daily", (req, res) => {
    try {
      res.json({ note: createDailyNote(req.body?.date) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/life/weekly", (req, res) => {
    try {
      res.json({ note: createWeeklyReview(req.body?.date) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/browser/snapshot", async (req, res) => {
    if (!req.body?.url) return res.status(400).json({ error: "url required" });
    res.json(await browserSnapshot(req.body.url));
  });

  app.get("/api/models", async (req, res) => {
    const prompt = String(req.query.prompt || "fix my backend api bug");
    res.json({
      cloudKeys: KEYS.length,
      modelCount: MODEL_CHAIN.length,
      route: routeInfo(prompt),
      local: await localModelStatus(),
    });
  });

  app.get("/api/status", async (_, res) => {
    res.json({
      keys: KEYS.length,
      models: MODEL_CHAIN.length,
      firecrawl: !!FIRECRAWL_KEY,
      memoryPath: getMemoryPath(),
      worldPath: getWorldPath(),
      lifePath: getLifeRoot(),
      logPath: getLogPath(),
      docs: await listDocuments(),
      local: await localModelStatus(),
    });
  });
}
