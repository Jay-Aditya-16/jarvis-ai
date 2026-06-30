import { buildModelQueue } from "../core/models.js";
import { getLocalModelPlan } from "../core/local-ai.js";
import { getSmallTalkReply, wantsLocalPreference } from "../core/input-shortcuts.js";
import { AGENT_CASES } from "./dataset.js";

export function runAgentBenchmark() {
  const plan = getLocalModelPlan();
  const results = AGENT_CASES.map((test) => {
    if (test.shortcut) {
      const reply = getSmallTalkReply(test.prompt);
      const localPreference = wantsLocalPreference(test.prompt);
      const checks = [
        {
          name: "shortcut-reply",
          pass: test.expectReply ? reply === test.expectReply : true,
          got: reply,
          expected: test.expectReply,
        },
        {
          name: "shortcut-local-preference",
          pass: test.expectLocalPreference === undefined || localPreference === test.expectLocalPreference,
          got: localPreference,
          expected: test.expectLocalPreference,
        },
      ];
      return {
        label: test.label,
        prompt: test.prompt,
        shortcut: true,
        checks,
        pass: checks.every((check) => check.pass),
      };
    }

    const queue = buildModelQueue(test.prompt, { localOnly: !!test.localOnly });
    const ids = queue.map((model) => model.id);
    const first = queue[0];
    const checks = [];

    if (test.expectedFirstRole) {
      const firstRoles = new Set([first?.role, ...(first?.roles || [])].filter(Boolean));
      checks.push({
        name: "first-role",
        pass: firstRoles.has(test.expectedFirstRole),
        got: [...firstRoles],
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
      first: first ? { id: first.id, role: first.role, roles: first.roles, local: !!first.local } : null,
      queue: queue.map((model) => ({ id: model.id, role: model.role, roles: model.roles, local: !!model.local, sizeGb: model.sizeGb })),
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
