#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = path.join(__dirname, "results.json");
const validationPath = path.join(__dirname, "validation-summary.json");

const data = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
const thresholds = {
  routing_accuracy: 0.90,
  skills_f1: 0.70,
  rag_ndcg: 0.50,
  sentinel_accuracy: 0.80,
  agent_accuracy: 1.00,
};
const actual = {
  routing_accuracy: data.routing.accuracy,
  skills_f1: data.skills.f1,
  rag_ndcg: data.rag.mean_ndcg,
  sentinel_accuracy: data.sentinel.accuracy,
  agent_accuracy: data.agent.accuracy,
  overall: data.overall,
};
const checks = Object.entries(thresholds).map(([name, min]) => ({
  name,
  min,
  actual: actual[name],
  pass: actual[name] >= min,
}));
const summary = {
  timestamp: new Date().toISOString(),
  passed: checks.every((check) => check.pass),
  checks,
  actual,
  matlab: {
    available: (() => {
      try {
        execFileSync("matlab", ["-batch", "version"], { stdio: "ignore", timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    })(),
    command: "npm run benchmark:matlab",
    script: "benchmark/analyze.m",
  },
};

fs.writeFileSync(validationPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (!summary.passed) process.exit(1);
