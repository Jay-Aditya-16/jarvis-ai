import fs from "fs";
import os from "os";
import path from "path";

export async function runLifeBenchmark() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-life-bench-"));
  process.env.JARVIS_LIFE_PATH = root;
  const life = await import("../core/life.js");

  const checks = [];
  const setup = life.ensureLifeOS();
  checks.push({
    name: "life-root-created",
    pass: fs.existsSync(setup.root) && setup.zones.every((zone) => fs.existsSync(path.join(setup.root, zone))),
    got: setup.root,
    expected: "root and zones exist",
  });

  const ideal = life.createIdealState("Make Jarvis Useful", "Reactive assistant", "Personal agent with context", ["Has TELOS context"]);
  checks.push({
    name: "ideal-state-created",
    pass: ideal.path.startsWith("IDEAL_STATE/") && fs.existsSync(ideal.absolutePath),
    got: ideal.path,
    expected: "IDEAL_STATE/*.md",
  });

  const daily = life.createDailyNote("2026-06-30");
  checks.push({
    name: "daily-note-created",
    pass: daily.path === "DAILY/2026-06-30.md" && fs.existsSync(daily.absolutePath),
    got: daily.path,
    expected: "DAILY/2026-06-30.md",
  });

  const learning = life.appendLifeEntry("LEARNINGS", "Filesystem First", "Plain Markdown context stays inspectable.");
  checks.push({
    name: "learning-entry-created",
    pass: learning.section === "LEARNINGS" && fs.existsSync(learning.absolutePath),
    got: learning.path,
    expected: "LEARNINGS entry",
  });

  const context = life.formatLifeContext();
  checks.push({
    name: "context-includes-telos",
    pass: context.includes("TELOS/MISSION.md") && context.includes("Life root:"),
    got: context.slice(0, 160),
    expected: "TELOS context summary",
  });

  let secretBlocked = false;
  try {
    life.writeLifeFile("LEARNINGS/secret.md", "OPENAI_API_KEY=sk-or-v1-thisshouldnotbestored");
  } catch {
    secretBlocked = true;
  }
  checks.push({
    name: "secret-values-blocked",
    pass: secretBlocked,
    got: secretBlocked,
    expected: true,
  });

  const correct = checks.filter((check) => check.pass).length;
  return {
    component: "life",
    root,
    total: checks.length,
    correct,
    accuracy: +(correct / checks.length).toFixed(4),
    checks,
  };
}
