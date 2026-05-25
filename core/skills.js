import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scanSkill }     from "./sentinel.js";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
export const SKILLS_DIR = path.join(__dirname, "..", "skills");

// ── Trigger map ────────────────────────────────────────────────────────────────
// Maps skill filename → regex. Multiple skills can fire at once — they stack.
export const SKILL_TRIGGERS = {
  // Custom
  "drones.md":              /\b(drone|uav|quadcopter|telemetry|mavlink|ardupilot|px4|fpv|swarm|flight|autopilot|esc|lora)\b/i,
  "security.md":            /\b(security|exploit|vulnerabilit|pentest|firewall|encrypt|jwt|oauth|xss|sql.inject|csrf|ssrf)\b/i,
  "cai-cybersecurity.md":   /\b(ctf|hackthebox|htb|pentest|recon|reconnaissance|nmap|gobuster|privilege.escal|privesc|lateral.move|kill.chain|bug.bounty|cve|payload|reverse.shell|metasploit|sqlmap|bloodhound|mimikatz|linpeas|ghidra|pwn|rop.chain|heap.exploit|format.string|steganograph|volatility|wireshark|exfiltrat|command.and.control|c2\b|c&c)\b/i,
  "startup.md":             /\b(startup|mvp|product.market|monetize|saas|investor|roadmap|go.to.market|churn|arr|mrr)\b/i,
  "robotics.md":            /\b(robot|ros2?|servo|actuator|embedded|esp32|arduino|raspberry.?pi|iot|firmware|stm32)\b/i,
  "coding.md":              /\b(refactor|clean.code|design.pattern|solid.principle|dry\b|kiss\b|code.review)\b/i,

  // Anthropic official
  "anthropic-claude-api.md":            /\b(anthropic|claude.api|claude.sdk|prompt.cach|@anthropic|haiku|sonnet|opus|claude.model)\b/i,
  "anthropic-mcp-builder.md":           /\b(mcp|model.context.protocol|mcp.server|mcp.tool|mcp.client|stdio.transport)\b/i,
  "anthropic-webapp-testing.md":        /\b(jest|playwright|cypress|vitest|unit.test|e2e.test|test.suite|spec\.|testing.library)\b/i,
  "anthropic-frontend-design.md":       /\b(frontend|ui.design|ux|tailwind|shadcn|radix|component.design|design.system)\b/i,
  "anthropic-docx.md":                  /\b(docx|word.document|\.docx|microsoft.word|word.file)\b/i,
  "anthropic-pdf.md":                   /\b(pdf|\.pdf|pdf.generat|pdf.creat|pdf.pars|reportlab|fpdf)\b/i,
  "anthropic-pptx.md":                  /\b(pptx|powerpoint|presentation|\.pptx|slide.deck)\b/i,
  "anthropic-xlsx.md":                  /\b(xlsx|excel|spreadsheet|\.xlsx|openpyxl|xlsxwriter|google.sheet)\b/i,
  "anthropic-canvas-design.md":         /\b(canvas|figma|wireframe|mockup|prototype|design.token|color.palette)\b/i,
  "anthropic-skill-creator.md":         /\b(create.skill|build.skill|write.skill|new.skill|skill\.md|skill.creator)\b/i,
  "anthropic-web-artifacts-builder.md": /\b(web.artifact|html.artifact|interactive.demo|react.artifact|sandbox)\b/i,
  "anthropic-doc-coauthoring.md":       /\b(co.?author|document.together|collab.*doc|shared.doc|doc.review)\b/i,
  "anthropic-brand-guidelines.md":      /\b(brand.guide|style.guide|brand.color|brand.identity|brand.voice|logo.usage)\b/i,
  "anthropic-theme-factory.md":         /\b(dark.mode|light.mode|color.scheme|theme.creat|theme.generat|design.token)\b/i,
  "anthropic-algorithmic-art.md":       /\b(generative.art|algorithmic.art|creative.cod|p5\.js|processing|shader|glsl)\b/i,

  // Vercel official
  "vercel-react-best-practices.md":     /\b(react|jsx|tsx|usestate|useeffect|usememo|next\.?js|nextjs|react.hook)\b/i,
  "vercel-react-native-skills.md":      /\b(react.native|expo|mobile.app|rn\b|ios.app|android.app|metro.bundler)\b/i,
  "vercel-deploy-to-vercel.md":         /\b(vercel.deploy|deploy.vercel|vercel.cli|vc.deploy|vercel.json|vercel.env)\b/i,
  "vercel-web-design-guidelines.md":    /\b(web.design|responsive.design|accessibility|a11y|wcag|aria|semantic.html)\b/i,
  "vercel-vercel-optimize.md":          /\b(core.web.vitals|lcp|fid|cls|lighthouse.score|performance.audit|bundle.size)\b/i,
  "vercel-react-view-transitions.md":   /\b(view.transition|page.transition|framer.motion|animate.presence|layout.anim)\b/i,
  "vercel-composition-patterns.md":     /\b(compound.component|render.prop|higher.order|hoc\b|composition.pattern|headless)\b/i,
  "vercel-find-skills.md":              /\b(find.skill|search.skill|discover.skill|install.skill|browse.skill)\b/i,
};

export function detectSkills(prompt) {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const active = [];
  for (const [file, pattern] of Object.entries(SKILL_TRIGGERS)) {
    if (pattern.test(prompt)) {
      const fp = path.join(SKILLS_DIR, file);
      if (fs.existsSync(fp)) active.push({ file, content: fs.readFileSync(fp, "utf8") });
    }
  }
  return active;
}

// ── Registry (skills.sh catalog) ──────────────────────────────────────────────
export const SKILL_REGISTRY = {
  "claude-api":             "https://raw.githubusercontent.com/anthropics/skills/main/skills/claude-api/SKILL.md",
  "mcp-builder":            "https://raw.githubusercontent.com/anthropics/skills/main/skills/mcp-builder/SKILL.md",
  "frontend-design":        "https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md",
  "webapp-testing":         "https://raw.githubusercontent.com/anthropics/skills/main/skills/webapp-testing/SKILL.md",
  "web-artifacts-builder":  "https://raw.githubusercontent.com/anthropics/skills/main/skills/web-artifacts-builder/SKILL.md",
  "skill-creator":          "https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md",
  "canvas-design":          "https://raw.githubusercontent.com/anthropics/skills/main/skills/canvas-design/SKILL.md",
  "doc-coauthoring":        "https://raw.githubusercontent.com/anthropics/skills/main/skills/doc-coauthoring/SKILL.md",
  "docx":                   "https://raw.githubusercontent.com/anthropics/skills/main/skills/docx/SKILL.md",
  "pdf":                    "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md",
  "pptx":                   "https://raw.githubusercontent.com/anthropics/skills/main/skills/pptx/SKILL.md",
  "xlsx":                   "https://raw.githubusercontent.com/anthropics/skills/main/skills/xlsx/SKILL.md",
  "brand-guidelines":       "https://raw.githubusercontent.com/anthropics/skills/main/skills/brand-guidelines/SKILL.md",
  "theme-factory":          "https://raw.githubusercontent.com/anthropics/skills/main/skills/theme-factory/SKILL.md",
  "algorithmic-art":        "https://raw.githubusercontent.com/anthropics/skills/main/skills/algorithmic-art/SKILL.md",
  "react-best-practices":   "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md",
  "react-native":           "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-native-skills/SKILL.md",
  "deploy-to-vercel":       "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/deploy-to-vercel/SKILL.md",
  "web-design-guidelines":  "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md",
  "vercel-optimize":        "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/vercel-optimize/SKILL.md",
  "react-view-transitions": "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-view-transitions/SKILL.md",
  "composition-patterns":   "https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/composition-patterns/SKILL.md",
  "find-skills":            "https://raw.githubusercontent.com/vercel-labs/skills/main/skills/find-skills/SKILL.md",
};

// ── Install / scan helpers ─────────────────────────────────────────────────────
export async function fetchSkill(url, { chalk, readlineSync }) {
  const ora = (await import("ora")).default;
  const spinner = ora("Fetching skill…").start();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const content  = await res.text();
    const filename = path.basename(url.split("?")[0]);

    spinner.text = "Scanning with Skill Sentinel…";
    const findings = scanSkill(content);
    spinner.stop();

    const critical = findings.filter((f) => f.severity === "CRITICAL");
    const warnings = findings.filter((f) => f.severity !== "CRITICAL");

    if (critical.length) {
      console.log(chalk.red.bold("\n  🛡  SKILL SENTINEL — BLOCKED\n"));
      critical.forEach((f) => console.log(`  ${chalk.red("[CRITICAL]")} ${f.id}`));
      warnings.forEach((f) => console.log(`  ${chalk.yellow(`[${f.severity}]`)} ${f.id}`));
      console.log(chalk.dim("\n  Skill NOT installed.\n"));
      return;
    }

    if (warnings.length) {
      console.log(chalk.yellow.bold("\n  🛡  Skill Sentinel — warnings:\n"));
      warnings.forEach((f) => console.log(`  ${chalk.yellow(`[${f.severity}]`)} ${f.id}`));
      const ok = readlineSync.keyInYNStrict(chalk.yellow("\n  Install anyway? [y/n] "));
      if (!ok) { console.log(chalk.dim("  Cancelled.\n")); return; }
    } else {
      console.log(chalk.green("  🛡  Skill Sentinel — CLEAN\n"));
    }

    fs.mkdirSync(SKILLS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SKILLS_DIR, filename), content, "utf8");
    console.log(chalk.green(`  ✓ Installed: skills/${filename}`));
    console.log(chalk.dim("  Add a keyword trigger in SKILL_TRIGGERS to auto-load it.\n"));
  } catch (e) {
    spinner.stop();
    console.log(chalk.red(`  Error: ${e.message}\n`));
  }
}

export async function installNamedSkill(name, deps) {
  const url = SKILL_REGISTRY[name];
  if (!url) {
    console.log(deps.chalk.red(`  Unknown skill: "${name}"`));
    console.log(deps.chalk.dim("  Run /skill registry to see available names.\n"));
    return;
  }
  await fetchSkill(url, deps);
}

export function listSkills() {
  if (!fs.existsSync(SKILLS_DIR)) { console.log("  No skills folder found\n"); return; }
  const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));
  if (!files.length) { console.log("  No skills installed yet\n"); return; }
  return files;
}

export function scanLocalSkill(filePath, { chalk }) {
  const fp = path.resolve(filePath);
  if (!fs.existsSync(fp)) { console.log(chalk.red(`  File not found: ${filePath}\n`)); return; }
  const content  = fs.readFileSync(fp, "utf8");
  const findings = scanSkill(content);

  console.log(chalk.bold(`\n  🛡  Skill Sentinel scan: ${path.basename(fp)}\n`));
  if (!findings.length) {
    console.log(chalk.green("  Result: CLEAN — no threats detected\n"));
    return;
  }
  findings.forEach((f) => {
    const color = f.severity === "CRITICAL" ? chalk.red : f.severity === "HIGH" ? chalk.yellow : chalk.cyan;
    console.log(`  ${color(`[${f.severity}]`)} ${f.id}`);
  });
  const hasCritical = findings.some((f) => f.severity === "CRITICAL");
  console.log("\n  Result: " + (hasCritical
    ? chalk.red("MALICIOUS — do not install")
    : chalk.yellow("SUSPICIOUS — review before use")) + "\n");
}

export function showRegistry({ chalk }) {
  console.log(chalk.bold("\n  skills.sh registry — available to install:\n"));
  const groups = { "Anthropic": [], "Vercel": [] };
  for (const [name, url] of Object.entries(SKILL_REGISTRY)) {
    const installed = fs.existsSync(path.join(SKILLS_DIR, `anthropic-${name}.md`)) ||
                      fs.existsSync(path.join(SKILLS_DIR, `vercel-${name}.md`))    ||
                      fs.existsSync(path.join(SKILLS_DIR, `${name}.md`));
    const tag = installed ? chalk.green("✓") : chalk.dim("○");
    const org = url.includes("anthropics") ? "Anthropic" : "Vercel";
    groups[org].push(`  ${tag} ${chalk.cyan(name.padEnd(26))} ${chalk.dim("/skill install " + name)}`);
  }
  for (const [org, lines] of Object.entries(groups)) {
    console.log(chalk.bold(`  ${org}:`));
    lines.forEach((l) => console.log(l));
    console.log();
  }
  console.log(chalk.dim("  Add any raw GitHub URL:  /skill add <url>\n"));
}
