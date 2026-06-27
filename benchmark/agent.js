import { buildModelQueue } from "../core/models.js";
import { getLocalModelPlan } from "../core/local-ai.js";
import { AGENT_CASES } from "./dataset.js";

export function runAgentBenchmark() {
  const plan = getLocalModelPlan();
  const results = AGENT_CASES.map((test) => {
    const queue = buildModelQueue(test.prompt, { localOnly: !!test.localOnly });
    const ids = queue.map((model) => model.id);
    const first = queue[0];
    const checks = [];

    if (test.expectedFirstRole) {
      checks.push({
        name: "first-role",
        pass: first?.role === test.expectedFirstRole,
        got: first?.role,
        expected: test.expectedFirstRole,
      });
    }

    if (test.maxLocalSizeGb) {
      checks.push({
        name: "local-size-budget",
        pass: queue.every((model) => !model.local || Number(model.sizeGb || 0) <= test.maxLocalSizeGb),
        got: queue.filter((model) => model.local).map((model) => `${model.id}:${model.sizeGb}GB`),
        expected: `<= ${test.maxLocalSizeGb}GB`,
      });
    }

    if (test.noDuplicates) {
      checks.push({
        name: "unique-queue",
        pass: new Set(ids).size === ids.length,
        got: ids.length,
        expected: new Set(ids).size,
      });
    }

    if (test.forbiddenPattern) {
      checks.push({
        name: "forbidden-large-local-models",
        pass: !queue.some((model) => model.local && test.forbiddenPattern.test(model.id)),
        got: ids,
        expected: "no 7B+ local fallback models",
      });
    }

    return {
      label: test.label,
      prompt: test.prompt,
      first: first ? { id: first.id, role: first.role, local: !!first.local } : null,
      queue: queue.map((model) => ({ id: model.id, role: model.role, local: !!model.local, sizeGb: model.sizeGb })),
      checks,
      pass: checks.every((check) => check.pass),
    };
  });

  const correct = results.filter((result) => result.pass).length;
  return {
    component: "agent",
    total: results.length,
    correct,
    accuracy: +(correct / results.length).toFixed(4),
    localProfile: plan.machine,
    maxLocalModelGb: plan.maxModelGb,
    safeLocalModels: plan.safe.map((model) => ({ id: model.id, sizeGb: model.sizeGb, role: model.role })),
    results,
  };
}
