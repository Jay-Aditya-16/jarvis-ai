import { scanSkill }    from "../core/sentinel.js";
import { SENTINEL_CASES } from "./dataset.js";

export function runSentinelBenchmark() {
  const results = [];
  const confusion = { CLEAN: {}, CRITICAL: {}, HIGH: {}, MEDIUM: {} };
  for (const sev of ["CLEAN", "CRITICAL", "HIGH", "MEDIUM"]) {
    confusion[sev] = { CLEAN: 0, CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  }

  for (const { content, expected_severity, label } of SENTINEL_CASES) {
    const findings = scanSkill(content);
    let got_severity;
    if (!findings.length) {
      got_severity = "CLEAN";
    } else {
      // Highest severity wins: CRITICAL > HIGH > MEDIUM
      const order = ["CRITICAL", "HIGH", "MEDIUM"];
      const sevs  = findings.map((f) => f.severity);
      got_severity = order.find((s) => sevs.includes(s)) ?? "MEDIUM";
    }

    const pass = got_severity === expected_severity;
    confusion[expected_severity][got_severity]++;

    results.push({ label, expected: expected_severity, got: got_severity, pass, findings });
  }

  const total   = SENTINEL_CASES.length;
  const correct = results.filter((r) => r.pass).length;

  // Per-class precision and recall from confusion matrix
  const classes = ["CLEAN", "CRITICAL", "HIGH", "MEDIUM"];
  const metrics = {};
  for (const cls of classes) {
    const tp = confusion[cls][cls];
    const fp = classes.reduce((s, c) => s + (c !== cls ? confusion[c][cls] : 0), 0);
    const fn = classes.reduce((s, c) => s + (c !== cls ? confusion[cls][c] : 0), 0);
    const precision = tp / (tp + fp) || 0;
    const recall    = tp / (tp + fn) || 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    metrics[cls] = { tp, fp, fn, precision: +precision.toFixed(4), recall: +recall.toFixed(4), f1: +f1.toFixed(4) };
  }

  return {
    component: "sentinel",
    total,
    correct,
    accuracy: +(correct / total).toFixed(4),
    confusion,
    metrics,
    results,
  };
}
