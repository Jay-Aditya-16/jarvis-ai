import path from "path";

export const PERMISSION_MODES = ["read-only", "ask-before-write", "full-agent", "dangerous-confirm"];

export function normalizeMode(mode) {
  return PERMISSION_MODES.includes(mode) ? mode : "ask-before-write";
}

export function describeMode(mode) {
  switch (normalizeMode(mode)) {
    case "read-only":
      return "read-only: permits inspection/search/status tools; blocks writes, installs, git mutation, and destructive commands.";
    case "ask-before-write":
      return "ask-before-write: asks before file writes, installs, git mutation, and other state-changing commands.";
    case "full-agent":
      return "full-agent: allows ordinary writes and commands; still asks before dangerous/destructive actions.";
    case "dangerous-confirm":
      return "dangerous-confirm: allows ordinary writes and asks for exact confirmation before destructive or secret-touching actions.";
    default:
      return describeMode("ask-before-write");
  }
}

function normalizePath(p) {
  if (!p) return "";
  return path.normalize(String(p));
}

function touchesSecretPath(p) {
  const fp = normalizePath(p);
  return /(^|\/)\.env(\.|$|\/)/.test(fp) || /(^|\/)(id_rsa|id_ed25519|\.npmrc|\.netrc|credentials|secrets?)(\.|$|\/)/i.test(fp);
}

function touchesSystemPath(p) {
  const fp = normalizePath(p);
  return /^(\/etc|\/bin|\/sbin|\/usr|\/System|\/Library|\/opt\/homebrew)(\/|$)/.test(fp);
}

export function classifyCommand(command = "") {
  const cmd = String(command).trim();
  const lower = cmd.toLowerCase();
  if (!cmd) return { level: "safe", reason: "empty command" };

  if (/\.env|or_key_|firecrawl_key|api[_-]?key|secret|token|password/.test(lower)) {
    return { level: "secret", reason: "command appears to touch secrets or credentials" };
  }

  const dangerous = [
    /(^|\s)sudo(\s|$)/,
    /(^|\s)su(\s|$)/,
    /(^|\s)rm\s+(-[^\n]*[rf]|--recursive|--force)/,
    /(^|\s)git\s+reset\s+--hard/,
    /(^|\s)git\s+clean\s+-/,
    /(^|\s)git\s+push(\s|$)/,
    /(^|\s)(pkill|killall)(\s|$)/,
    /(^|\s)(dd|mkfs|diskutil)(\s|$)/,
    /curl\b[^|\n]*\|\s*(sh|bash|zsh)/,
    /wget\b[^|\n]*\|\s*(sh|bash|zsh)/,
  ];
  if (dangerous.some((re) => re.test(lower))) {
    return { level: "dangerous", reason: "destructive, privileged, or remote-code execution command" };
  }

  const writes = [
    /(^|\s)(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|update)(\s|$)/,
    /(^|\s)git\s+(add|commit|merge|rebase|checkout|switch|restore|pull)(\s|$)/,
    /(^|\s)(mkdir|touch|mv|cp|tee|chmod|chown)(\s|$)/,
    /(^|\s)sed\s+-i(\s|$)/,
    />|>>/,
  ];
  if (writes.some((re) => re.test(lower))) {
    return { level: "write", reason: "command may change files, dependencies, or git state" };
  }

  return { level: "safe", reason: "read-only or low-risk command" };
}

export function evaluateToolPolicy(name, args = {}, mode = "ask-before-write") {
  const activeMode = normalizeMode(mode);

  if ([
    "finish",
    "web_search",
    "list_dir",
    "search_files",
    "git_diff",
    "preview_edit",
    "browser_snapshot",
  ].includes(name)) {
    return { action: "allow", reason: "read-only tool" };
  }

  if (name === "ensure_server") {
    if (activeMode === "read-only") return { action: "deny", reason: "read-only mode blocks starting background processes" };
    return { action: "allow", reason: "local Jarvis server lifecycle is allowed" };
  }

  if (name === "read_file" || name === "read_file_chunk") {
    const fp = args.path || "";
    if (touchesSecretPath(fp)) return { action: "deny", reason: "secret files may not be read directly; use env metadata instead" };
    return { action: "allow", reason: "read-only file access" };
  }

  if (["write_file", "replace_range", "insert_after", "delete_range"].includes(name)) {
    const fp = args.path || "";
    const level = touchesSecretPath(fp) || touchesSystemPath(fp) ? "dangerous" : "write";
    if (activeMode === "read-only") return { action: "deny", reason: "read-only mode blocks file edits" };
    if (activeMode === "ask-before-write") return { action: "confirm", level, reason: `${name} on ${fp}` };
    if (level === "dangerous") return { action: "confirm", level, reason: `protected or secret-adjacent write to ${fp}` };
    return { action: "allow", reason: "write allowed by active mode" };
  }

  if (["create_task", "update_task"].includes(name)) {
    if (activeMode === "read-only") return { action: "deny", reason: "read-only mode blocks task state changes" };
    if (activeMode === "ask-before-write") return { action: "confirm", level: "write", reason: `${name} changes local world state` };
    return { action: "allow", reason: "task state changes allowed by active mode" };
  }

  if (name === "bash") {
    const risk = classifyCommand(args.command || "");
    if (risk.level === "safe") return { action: "allow", reason: risk.reason };
    if (activeMode === "read-only") return { action: "deny", reason: `${risk.reason}; blocked by read-only mode` };
    if (risk.level === "secret") return { action: "confirm", level: "dangerous", reason: risk.reason };
    if (risk.level === "dangerous") return { action: "confirm", level: "dangerous", reason: risk.reason };
    if (activeMode === "ask-before-write") return { action: "confirm", level: "write", reason: risk.reason };
    return { action: "allow", reason: risk.reason };
  }

  return { action: "deny", reason: `unknown tool: ${name}` };
}
