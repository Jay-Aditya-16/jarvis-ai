import fs from "fs";
import path from "path";

export function loadMcpConfig(cwd = process.cwd()) {
  const fp = path.join(cwd, ".mcp.json");
  try {
    if (!fs.existsSync(fp)) return { path: fp, servers: {} };
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    return { path: fp, servers: raw.mcpServers || raw.servers || {} };
  } catch (e) {
    return { path: fp, error: e.message, servers: {} };
  }
}

export function listMcpServers(cwd = process.cwd()) {
  const cfg = loadMcpConfig(cwd);
  return Object.entries(cfg.servers || {}).map(([name, server]) => ({
    name,
    command: server.command,
    args: server.args || [],
    env: Object.keys(server.env || {}),
  }));
}
