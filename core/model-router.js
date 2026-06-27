import { getLocalModelPlan } from "./local-ai.js";

const ROLE_ORDER = ["coding", "reasoning", "thinking", "fast", "general"];

export const ROUTE_RULES = [
  { role: "coding", weight: 4, pattern: /\b(code|debug|fix|bug|build|implement|refactor|optimi[sz]e|function|class|api|backend|frontend|docker|git|sql|python|javascript|typescript|node|rust|golang|bash|script|error|syntax|deploy|npm|pip|import|repo|repository|tests?|lint|server)\b/i },
  { role: "reasoning", weight: 3, pattern: /\b(analy[sz]e|reason|architecture|design|strategy|plan|compare|evaluate|system|workflow|explain|understand|trade-?off|performance|security|review|decision|scalability)\b/i },
  { role: "thinking", weight: 4, pattern: /\b(math|proof|logic|theorem|calculate|derive|step by step|think through|complex problem|probability|algorithm|complexity)\b/i },
  { role: "fast", weight: 2, pattern: /\b(quick|brief|short|simple|summari[sz]e|rewrite|format|translate|small|tiny)\b/i },
  { role: "general", weight: 1, pattern: /\b(what|who|when|where|why|ideas?|history|capital|weather|tell me|explain)\b/i },
];

function uniqById(models) {
  const seen = new Set();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

export function classifyPrompt(prompt = "") {
  const scores = Object.fromEntries(ROLE_ORDER.map((role) => [role, 0]));
  for (const rule of ROUTE_RULES) {
    const matches = String(prompt).match(rule.pattern);
    if (matches) scores[rule.role] += rule.weight + Math.min(2, matches.length - 1);
  }

  const text = String(prompt).toLowerCase();
  if (/\b(system design|architecture review|design review|trade-?off|scalability)\b/.test(text)) {
    scores.reasoning += 3;
  }
  if (/\b(fix|debug|implement|build|write|refactor)\b/.test(text)) {
    scores.coding += 2;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [role, score] = ranked[0];
  return {
    role: score > 0 ? role : "general",
    confidence: score > 0 ? Math.min(1, score / 6) : 0.25,
    scores,
  };
}

export function chooseModelFromCatalog(prompt, models, options = {}) {
  const queue = buildModelQueueFromCatalog(prompt, models, options);
  return queue[0] || models[0];
}

export function buildModelQueueFromCatalog(prompt, models, options = {}) {
  const route = classifyPrompt(prompt);
  const localPlan = getLocalModelPlan();
  const localIds = new Set(localPlan.safe.map((model) => model.id));
  const hasCloud = options.hasCloud !== false;
  const preferLocal = options.preferLocal || process.env.JARVIS_PREFER_LOCAL === "1" || !hasCloud;
  const localOnly = options.localOnly || process.env.JARVIS_LOCAL_ONLY === "1";

  const available = localOnly
    ? models.filter((model) => model.local && localIds.has(model.id))
    : models.filter((model) => !model.local || localIds.has(model.id));
  const cloud = available.filter((model) => !model.local);
  const local = available.filter((model) => model.local);

  const byRole = (list, role) => list.filter((model) => model.role === role || model.roles?.includes(role));
  const generalCloud = [...byRole(cloud, "fast"), ...byRole(cloud, "general"), ...byRole(cloud, "reasoning")];
  const generalLocal = [...byRole(local, route.role), ...byRole(local, "coding"), ...byRole(local, "reasoning"), ...byRole(local, "general"), ...byRole(local, "fast")];

  const cloudQueue = [
    ...byRole(cloud, route.role),
    ...generalCloud,
    ...cloud,
  ];
  const localQueue = [
    ...byRole(local, route.role),
    ...generalLocal,
    ...local,
  ];

  const queue = preferLocal ? [...localQueue, ...cloudQueue] : [...cloudQueue, ...localQueue];
  return uniqById(options.preferredModel ? [options.preferredModel, ...queue] : queue);
}
