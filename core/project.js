import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function run(cmd, cwd, timeout = 2500) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout, shell: "/bin/zsh" });
    return (stdout || stderr || "").trim();
  } catch (e) {
    return (e.stdout || e.stderr || e.message || "").trim();
  }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

function listEnvFiles(cwd) {
  const names = [".env", ".env.local", ".env.development", ".env.production", ".env.example"];
  return names.filter((name) => fs.existsSync(path.join(cwd, name))).map((name) => {
    const fp = path.join(cwd, name);
    let keys = [];
    try {
      keys = fs.readFileSync(fp, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => line.split("=", 1)[0].trim())
        .filter(Boolean);
    } catch {}
    return { file: name, keys };
  });
}

function detectPackageManager(cwd) {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) return "npm";
  if (fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock"))) return "bun";
  return fs.existsSync(path.join(cwd, "package.json")) ? "npm" : "unknown";
}

function detectFrameworks(pkg) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);
  const frameworks = [];
  if (has("next")) frameworks.push("Next.js");
  if (has("react")) frameworks.push("React");
  if (has("vite")) frameworks.push("Vite");
  if (has("express")) frameworks.push("Express");
  if (has("@modelcontextprotocol/sdk")) frameworks.push("MCP");
  if (has("openai")) frameworks.push("OpenAI-compatible API");
  if (has("vectra")) frameworks.push("Vectra RAG");
  if (has("@xenova/transformers")) frameworks.push("local embeddings");
  return frameworks;
}

function inferVerifyCommands(pkg, packageManager, cwd) {
  const scripts = pkg?.scripts || {};
  const run = packageManager === "yarn" ? "yarn" : packageManager === "pnpm" ? "pnpm" : "npm run";
  const commands = [];
  if (scripts.test) commands.push(packageManager === "npm" ? "npm test" : `${packageManager} test`);
  if (scripts.lint) commands.push(`${run} lint`);
  if (scripts.check) commands.push(`${run} check`);
  if (scripts.typecheck) commands.push(`${run} typecheck`);
  if (fs.existsSync(path.join(cwd, "claw.js"))) commands.push("node --check claw.js");
  if (fs.existsSync(path.join(cwd, "server.js"))) commands.push("node --check server.js");
  return [...new Set(commands)];
}

export async function scanProject(cwd = process.cwd()) {
  const pkg = readJson(path.join(cwd, "package.json"));
  const packageManager = detectPackageManager(cwd);
  const gitBranch = await run("git branch --show-current", cwd);
  const gitStatus = await run("git status --short", cwd);
  const ports = await run(`lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $1 ":" $9}' | head -20`, cwd, 2000);

  return {
    cwd,
    packageManager,
    packageName: pkg?.name || path.basename(cwd),
    scripts: pkg?.scripts || {},
    frameworks: detectFrameworks(pkg),
    envFiles: listEnvFiles(cwd),
    git: {
      branch: gitBranch || "unknown",
      dirtyFiles: gitStatus ? gitStatus.split(/\r?\n/).length : 0,
      status: gitStatus || "clean",
    },
    verifyCommands: inferVerifyCommands(pkg, packageManager, cwd),
    openPorts: ports ? ports.split(/\r?\n/).filter(Boolean) : [],
  };
}

export function formatProjectContext(project) {
  if (project?.error) return `project scan unavailable: ${project.error}`;
  const scriptNames = Object.keys(project.scripts || {});
  const env = (project.envFiles || []).map((f) => `${f.file} keys=[${f.keys.join(", ") || "none"}]`).join("; ") || "none";
  const verify = (project.verifyCommands || []).join("; ") || "none detected";
  const ports = (project.openPorts || []).slice(0, 8).join("; ") || "none visible";
  return [
    `cwd: ${project.cwd}`,
    `package: ${project.packageName} (${project.packageManager})`,
    `frameworks: ${(project.frameworks || []).join(", ") || "unknown"}`,
    `scripts: ${scriptNames.join(", ") || "none"}`,
    `git: branch=${project.git.branch}, dirtyFiles=${project.git.dirtyFiles}`,
    `env metadata: ${env}`,
    `verify commands: ${verify}`,
    `open ports: ${ports}`,
  ].join("\n");
}
