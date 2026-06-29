import fs from "fs";
import path from "path";
import os from "os";
import "./env.js";

const MEMORY_ROOT = process.env.JARVIS_MEMORY_PATH ?? path.join(os.homedir(), ".jarvis-unified");
const LIFE_ROOT = resolveRoot(process.env.JARVIS_LIFE_PATH || path.join(MEMORY_ROOT, "life"));

const ZONES = {
  TELOS: "TELOS",
  IDEAL_STATE: "IDEAL_STATE",
  PROJECTS: "PROJECTS",
  DAILY: "DAILY",
  WEEKLY_REVIEWS: "WEEKLY_REVIEWS",
  DECISIONS: "DECISIONS",
  LEARNINGS: "LEARNINGS",
};

const KEY_FILES = [
  "TELOS/MISSION.md",
  "TELOS/GOALS.md",
  "IDENTITY.md",
  "PREFERENCES.md",
];

function resolveRoot(value) {
  const raw = String(value || "").trim();
  if (!raw) return path.join(os.homedir(), ".jarvis-unified", "life");
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  return path.resolve(raw);
}

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function normalizeDate(value = today()) {
  const date = String(value || today()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
  return date;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureFile(relativePath, content) {
  const target = safeLifePath(relativePath);
  ensureDir(path.dirname(target));
  if (!fs.existsSync(target)) fs.writeFileSync(target, content, "utf8");
}

function safeLifePath(relativePath = "") {
  const rel = String(relativePath || "").trim().replace(/^\/+/, "");
  const target = path.resolve(LIFE_ROOT, rel);
  const root = path.resolve(LIFE_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Life path escapes root: ${relativePath}`);
  }
  return target;
}

function toRelative(target) {
  return path.relative(LIFE_ROOT, target).split(path.sep).join("/");
}

function assertNoSecrets(content) {
  const text = String(content ?? "");
  const patterns = [
    /sk-or-v1-[A-Za-z0-9_-]{10,}/,
    /fc-[A-Za-z0-9_-]{10,}/,
    /gh[pousr]_[A-Za-z0-9_]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{20,}/,
    /AIza[0-9A-Za-z_-]{20,}/,
    /(?:OPENAI_API_KEY|OR_KEY_\d+|FIRECRAWL_KEY)\s*=\s*["']?[^"'\s#]{8,}/i,
  ];
  if (patterns.some((pattern) => pattern.test(text))) {
    throw new Error("LifeOS notes may store secret metadata, not secret values.");
  }
}

function readSnippet(relativePath, maxChars = 900) {
  try {
    const raw = fs.readFileSync(safeLifePath(relativePath), "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() && !line.trim().startsWith("<!--"));
    return lines.slice(0, 18).join("\n").slice(0, maxChars);
  } catch {
    return "";
  }
}

function walkMarkdownFiles(dir = LIFE_ROOT, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walkMarkdownFiles(full, out);
    else if (item.isFile() && item.name.endsWith(".md")) {
      const stat = fs.statSync(full);
      out.push({ path: toRelative(full), bytes: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return out;
}

function uniqueRelativePath(directory, filename) {
  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  let candidate = `${directory}/${filename}`;
  if (!fs.existsSync(safeLifePath(candidate))) return candidate;
  for (let i = 2; i < 1000; i++) {
    candidate = `${directory}/${base}-${i}${ext}`;
    if (!fs.existsSync(safeLifePath(candidate))) return candidate;
  }
  throw new Error(`could not create unique LifeOS file for ${filename}`);
}

function normalizeZone(section) {
  const raw = String(section || "LEARNINGS").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return ZONES[raw] || ZONES.LEARNINGS;
}

export function slugifyLifeTitle(title = "untitled") {
  return String(title || "untitled")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "untitled";
}

export function getLifeRoot() {
  return LIFE_ROOT;
}

export function ensureLifeOS() {
  ensureDir(LIFE_ROOT);
  Object.values(ZONES).forEach((zone) => ensureDir(path.join(LIFE_ROOT, zone)));

  ensureFile("README.md", `# Jarvis Life Layer\n\nThis is Jarvis's local personal operating-system context. It is intentionally plain Markdown so it can be searched, edited, backed up, and inspected without a database.\n\n## Zones\n\n- TELOS: mission, goals, and direction.\n- IDEAL_STATE: desired outcomes with success criteria.\n- PROJECTS: project facts, plans, and recurring workflows.\n- DAILY: daily notes and action logs.\n- WEEKLY_REVIEWS: weekly reflection and course correction.\n- DECISIONS: decisions and rationale.\n- LEARNINGS: reusable lessons and observations.\n\nDo not store API keys, passwords, tokens, or private key values here. Store only metadata such as \"OpenRouter key exists in .env\".\n`);

  ensureFile("TELOS/MISSION.md", `# Mission\n\nState the durable mission Jarvis should optimize for.\n\n## Current Mission\n\nNot set yet.\n`);

  ensureFile("TELOS/GOALS.md", `# Goals\n\n## Active Goals\n\n- [ ] Define the top three goals Jarvis should keep in mind.\n\n## Parking Lot\n\n- Ideas that matter, but are not active commitments yet.\n`);

  ensureFile("IDENTITY.md", `# Identity\n\nStable context about the user, working style, values, constraints, and preferences.\n\n## Notes\n\n- Not set yet.\n`);

  ensureFile("PREFERENCES.md", `# Preferences\n\nUse this for durable preferences Jarvis should respect.\n\n## Working Preferences\n\n- Ask before destructive actions.\n- Keep secrets as metadata only, never values.\n`);

  return { root: LIFE_ROOT, zones: Object.values(ZONES), keyFiles: KEY_FILES };
}

export function readLifeFile(relativePath) {
  ensureLifeOS();
  return fs.readFileSync(safeLifePath(relativePath), "utf8");
}

export function writeLifeFile(relativePath, content) {
  ensureLifeOS();
  assertNoSecrets(content);
  const target = safeLifePath(relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, String(content ?? ""), "utf8");
  return { path: toRelative(target), absolutePath: target, bytes: Buffer.byteLength(String(content ?? "")) };
}

export function appendLifeEntry(section, title, content = "") {
  ensureLifeOS();
  assertNoSecrets(content);
  const zone = normalizeZone(section);
  const name = `${today()}-${slugifyLifeTitle(title)}.md`;
  const relativePath = uniqueRelativePath(zone, name);
  const body = `# ${title || "Untitled"}\n\n- Date: ${new Date().toISOString()}\n- Zone: ${zone}\n\n${String(content || "No details yet.").trim()}\n`;
  const written = writeLifeFile(relativePath, body);
  return { ...written, section: zone, title: title || "Untitled" };
}

export function createIdealState(title, currentState = "", idealState = "", criteria = []) {
  ensureLifeOS();
  const cleanCriteria = Array.isArray(criteria) ? criteria : String(criteria || "").split(/\r?\n/);
  assertNoSecrets([title, currentState, idealState, ...cleanCriteria].join("\n"));
  const relativePath = uniqueRelativePath(ZONES.IDEAL_STATE, `${today()}-${slugifyLifeTitle(title)}.md`);
  const checklist = cleanCriteria.map((item) => String(item).trim()).filter(Boolean);
  const body = `# ${title || "Ideal State"}\n\n- Created: ${new Date().toISOString()}\n- Status: draft\n\n## Current State\n\n${String(currentState || "Describe the current state.").trim()}\n\n## Ideal State\n\n${String(idealState || "Describe the desired future state.").trim()}\n\n## Success Criteria\n\n${checklist.length ? checklist.map((item) => `- [ ] ${item}`).join("\n") : "- [ ] Define measurable success criteria."}\n\n## Next Actions\n\n- [ ] Choose the first concrete action.\n\n## Review Notes\n\n- Add progress updates here.\n`;
  const written = writeLifeFile(relativePath, body);
  return { ...written, title: title || "Ideal State" };
}

export function createDailyNote(date = today()) {
  ensureLifeOS();
  const day = normalizeDate(date);
  const relativePath = `${ZONES.DAILY}/${day}.md`;
  const target = safeLifePath(relativePath);
  if (fs.existsSync(target)) return { path: relativePath, absolutePath: target, existed: true };
  const body = `# Daily Note - ${day}\n\n## Focus\n\n- [ ] Pick the main outcome for today.\n\n## State\n\nEnergy:\nMood:\nConstraints:\n\n## Tasks\n\n- [ ]\n\n## Log\n\n-\n\n## Learnings\n\n-\n\n## End-of-Day Review\n\nWhat moved forward?\n\nWhat should change tomorrow?\n`;
  return { ...writeLifeFile(relativePath, body), existed: false };
}

export function createWeeklyReview(date = today()) {
  ensureLifeOS();
  const day = normalizeDate(date);
  const relativePath = `${ZONES.WEEKLY_REVIEWS}/${day}.md`;
  const target = safeLifePath(relativePath);
  if (fs.existsSync(target)) return { path: relativePath, absolutePath: target, existed: true };
  const body = `# Weekly Review - ${day}\n\n## Wins\n\n-\n\n## Friction\n\n-\n\n## Decisions\n\n-\n\n## Learnings\n\n-\n\n## Next Week\n\n- [ ]\n`;
  return { ...writeLifeFile(relativePath, body), existed: false };
}

export function lifeSummary() {
  ensureLifeOS();
  const files = walkMarkdownFiles();
  const counts = Object.values(ZONES).reduce((acc, zone) => {
    acc[zone] = files.filter((file) => file.path.startsWith(`${zone}/`)).length;
    return acc;
  }, {});
  const keyFiles = KEY_FILES.map((file) => ({
    path: file,
    exists: fs.existsSync(safeLifePath(file)),
    snippet: readSnippet(file, 700),
  }));
  const recent = files
    .slice()
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 12)
    .map((file) => ({ path: file.path, bytes: file.bytes, updatedAt: new Date(file.mtimeMs).toISOString() }));

  return {
    root: LIFE_ROOT,
    zones: Object.values(ZONES),
    counts,
    keyFiles,
    recent,
    totalMarkdownFiles: files.length,
    generatedAt: new Date().toISOString(),
  };
}

export function formatLifeSummary(summary = lifeSummary()) {
  const lines = [
    `Life root: ${summary.root}`,
    `Markdown files: ${summary.totalMarkdownFiles}`,
    "",
    "Zones:",
    ...Object.entries(summary.counts || {}).map(([zone, count]) => `- ${zone}: ${count}`),
    "",
    "Key files:",
    ...summary.keyFiles.map((file) => `- ${file.path}${file.exists ? "" : " (missing)"}`),
  ];
  if (summary.recent?.length) {
    lines.push("", "Recent:", ...summary.recent.slice(0, 8).map((file) => `- ${file.path} (${file.updatedAt})`));
  }
  return lines.join("\n");
}

export function formatLifeContext() {
  const summary = lifeSummary();
  const keyContext = summary.keyFiles
    .filter((file) => file.snippet)
    .map((file) => `[${file.path}]\n${file.snippet}`)
    .join("\n\n")
    .slice(0, 4200);
  const recent = summary.recent
    .filter((file) => !KEY_FILES.includes(file.path))
    .slice(0, 6)
    .map((file) => `- ${file.path}`)
    .join("\n");

  return [
    `Life root: ${summary.root}`,
    "Use this as personal alignment context. Do not invent personal facts. Do not edit Life notes unless the user asks.",
    keyContext ? `\nKey context:\n${keyContext}` : "",
    recent ? `\nRecent Life files:\n${recent}` : "",
  ].filter(Boolean).join("\n");
}
