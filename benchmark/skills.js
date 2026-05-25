import { detectSkills } from "../core/skills.js";
import { SKILL_CASES }  from "./dataset.js";

export function runSkillsBenchmark() {
  const results = [];
  let tp = 0, fp = 0, fn = 0;

  for (const { prompt, should_load, should_not_load } of SKILL_CASES) {
    const loaded     = detectSkills(prompt).map((s) => s.file);
    const loaded_set = new Set(loaded);

    const hits    = should_load.filter((f) => loaded_set.has(f));
    const misses  = should_load.filter((f) => !loaded_set.has(f));
    const false_p = should_not_load.filter((f) => loaded_set.has(f));

    tp += hits.length;
    fn += misses.length;
    fp += false_p.length;

    results.push({
      prompt:       prompt.slice(0, 60),
      expected:     should_load,
      loaded,
      hits,
      misses,
      false_positives: false_p,
      pass: misses.length === 0 && false_p.length === 0,
    });
  }

  const precision = tp / (tp + fp) || 0;
  const recall    = tp / (tp + fn) || 0;
  const f1        = precision + recall > 0
    ? 2 * precision * recall / (precision + recall)
    : 0;

  return {
    component: "skills",
    total:     SKILL_CASES.length,
    correct:   results.filter((r) => r.pass).length,
    precision,
    recall,
    f1,
    tp, fp, fn,
    results,
  };
}
