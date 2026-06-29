import { chooseModel, MODEL_CHAIN } from "../core/models.js";
import { ROUTING_CASES } from "./dataset.js";

export function runRoutingBenchmark() {
  const results = [];
  let correct = 0;

  for (const { prompt, expected } of ROUTING_CASES) {
    const chosen = chooseModel(prompt);
    const roles = new Set([chosen.role, ...(chosen.roles || [])]);
    const pass   = roles.has(expected);
    if (pass) correct++;

    results.push({
      prompt:   prompt.slice(0, 60),
      expected,
      got:      chosen.role,
      roles:    [...roles],
      model:    chosen.name,
      pass,
    });
  }

  const total    = ROUTING_CASES.length;
  const accuracy = correct / total;

  // Per-role breakdown
  const roles = [...new Set(ROUTING_CASES.map((c) => c.expected))];
  const byRole = {};
  for (const role of roles) {
    const cases = results.filter((r) => r.expected === role);
    const hits  = cases.filter((r) => r.pass).length;
    byRole[role] = { total: cases.length, correct: hits, accuracy: hits / cases.length };
  }

  return { component: "routing", total, correct, accuracy, byRole, results };
}
