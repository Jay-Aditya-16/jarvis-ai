import fs from "fs";
import path from "path";
import os from "os";

const ROOT = process.env.JARVIS_MEMORY_PATH ?? path.join(os.homedir(), ".jarvis-unified");
const WORLD_FILE = path.join(ROOT, "world.json");

function ensureDir() {
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
}

export function readWorld() {
  try {
    if (fs.existsSync(WORLD_FILE)) return JSON.parse(fs.readFileSync(WORLD_FILE, "utf8"));
  } catch {}
  return { projects: {}, tasks: [], lastActions: [], expectations: {}, lastUpdated: Date.now() };
}

export function writeWorld(world) {
  ensureDir();
  world.lastUpdated = Date.now();
  fs.writeFileSync(WORLD_FILE, JSON.stringify(world, null, 2), "utf8");
  return world;
}

export function updateProjectWorld(project) {
  const world = readWorld();
  if (project?.cwd) {
    world.projects[project.cwd] = {
      packageName: project.packageName,
      packageManager: project.packageManager,
      frameworks: project.frameworks,
      scripts: Object.keys(project.scripts || {}),
      verifyCommands: project.verifyCommands,
      git: project.git,
      envFiles: project.envFiles?.map((f) => ({ file: f.file, keys: f.keys })),
      observedAt: Date.now(),
    };
  }
  return writeWorld(world);
}

export function recordAction(action) {
  const world = readWorld();
  world.lastActions = [{ time: Date.now(), ...action }, ...(world.lastActions || [])].slice(0, 100);
  return writeWorld(world);
}

export function upsertTask(task) {
  const world = readWorld();
  const id = task.id || `task-${Date.now()}`;
  const nextTask = { id, status: "open", createdAt: Date.now(), ...task };
  const existing = (world.tasks || []).filter((t) => t.id !== id);
  world.tasks = [nextTask, ...existing].slice(0, 100);
  writeWorld(world);
  return nextTask;
}

export function getWorldPath() { return WORLD_FILE; }
