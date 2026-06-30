import { readWorld, upsertTask, writeWorld } from "./world.js";

export function listTasks() {
  return readWorld().tasks || [];
}

export function createTask(title, details = {}) {
  return upsertTask({ title, ...details });
}

export function updateTask(id, patch = {}) {
  const world = readWorld();
  world.tasks = (world.tasks || []).map((task) => task.id === id ? { ...task, ...patch, updatedAt: Date.now() } : task);
  writeWorld(world);
  return world.tasks.find((task) => task.id === id) || null;
}
