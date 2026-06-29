#!/usr/bin/env node
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { runRoutingBenchmark }  from "./routing.js";
import { runSkillsBenchmark }   from "./skills.js";
import { runRagBenchmark }      from "./rag.js";
import { runSentinelBenchmark } from "./sentinel.js";
import { runAgentBenchmark }    from "./agent.js";
import { runLifeBenchmark }     from "./life.js";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE   = path.join(__dirname, "results.json");

const bar = (v, w = 30) => {
  const clamped = Math.max(0, Math.min(1, v));
  const filled  = Math.round(clamped * w);
  return "[" + "█".repeat(filled) + "░".repeat(w - filled) + "]";
};
const pct = (v) => `${(v * 100).toFixed(1)}%`;

async function main() {
  console.log("\n  ╔══════════════════════════════════════╗");
  console.log("  ║      Jarvis Benchmark Suite          ║");
  console.log("  ╚══════════════════════════════════════╝\n");

  const suite = {};

  // ── 1. Routing ──────────────────────────────────────────────────────────────
  process.stdout.write("  Running routing benchmark…");
  const routing = runRoutingBenchmark();
  suite.routing = routing;
  console.log(`  done  (${routing.total} cases)\n`);

  console.log(`  Routing accuracy  ${bar(routing.accuracy)} ${pct(routing.accuracy)}`);
  for (const [role, m] of Object.entries(routing.byRole)) {
    console.log(`    ${role.padEnd(12)} ${bar(m.accuracy, 20)} ${pct(m.accuracy)}  (${m.correct}/${m.total})`);
  }

  // ── 2. Skills ───────────────────────────────────────────────────────────────
  process.stdout.write("\n  Running skills benchmark…");
  const skills = runSkillsBenchmark();
  suite.skills = skills;
  console.log(`  done  (${skills.total} cases)\n`);

  console.log(`  Skills precision  ${bar(skills.precision)} ${pct(skills.precision)}`);
  console.log(`  Skills recall     ${bar(skills.recall)}    ${pct(skills.recall)}`);
  console.log(`  Skills F1         ${bar(skills.f1)}        ${pct(skills.f1)}`);

  // ── 3. RAG ──────────────────────────────────────────────────────────────────
  process.stdout.write("\n  Running RAG benchmark (embeddings load on first run)…");
  const rag = await runRagBenchmark();
  suite.rag = rag;
  console.log(`  done  (${rag.total} cases)\n`);

  console.log(`  RAG NDCG@3        ${bar(rag.mean_ndcg)} ${pct(rag.mean_ndcg)}`);
  console.log(`  RAG MRR           ${bar(rag.mean_mrr)}  ${pct(rag.mean_mrr)}`);
  console.log(`  RAG Hit@1         ${bar(rag.hit_at_1)}  ${pct(rag.hit_at_1)}`);
  console.log(`  RAG Hit@3         ${bar(rag.hit_at_3)}  ${pct(rag.hit_at_3)}`);
  console.log(`  Avg latency       ${rag.mean_latency} ms`);

  // ── 4. Sentinel ─────────────────────────────────────────────────────────────
  process.stdout.write("\n  Running sentinel benchmark…");
  const sentinel = runSentinelBenchmark();
  suite.sentinel = sentinel;
  console.log(`  done  (${sentinel.total} cases)\n`);

  console.log(`  Sentinel accuracy ${bar(sentinel.accuracy)} ${pct(sentinel.accuracy)}`);
  for (const [cls, m] of Object.entries(sentinel.metrics)) {
    if (m.tp + m.fp + m.fn === 0) continue;
    console.log(`    ${cls.padEnd(10)} P=${pct(m.precision)}  R=${pct(m.recall)}  F1=${pct(m.f1)}`);
  }

  // ── 5. Agent runtime ───────────────────────────────────────────────────────
  process.stdout.write("\n  Running agent runtime benchmark…");
  const agent = runAgentBenchmark();
  suite.agent = agent;
  console.log(`  done  (${agent.total} cases)\n`);
  console.log(`  Agent runtime     ${bar(agent.accuracy)} ${pct(agent.accuracy)}`);
  console.log(`  Local profile     ${agent.localProfile.profile} · ${agent.localProfile.arch} · ${agent.localProfile.totalRamGb}GB RAM`);
  console.log(`  Safe local models ${agent.safeLocalModels.map((m) => m.id).join(", ")}`);

  // ── 6. LifeOS layer ─────────────────────────────────────────────────────────
  process.stdout.write("\n  Running LifeOS layer benchmark...");
  const life = await runLifeBenchmark();
  suite.life = life;
  console.log(`  done  (${life.total} checks)\n`);
  console.log(`  LifeOS layer      ${bar(life.accuracy)} ${pct(life.accuracy)}`);
  console.log(`  LifeOS test root  ${life.root}`);

  // ── Failures ─────────────────────────────────────────────────────────────────
  const routing_fails  = routing.results.filter((r) => !r.pass);
  const skills_fails   = skills.results.filter((r) => !r.pass);
  const rag_fails      = rag.results.filter((r) => r.hit_at_3 === 0);
  const sentinel_fails = sentinel.results.filter((r) => !r.pass);
  const agent_fails    = agent.results.filter((r) => !r.pass);
  const life_fails     = life.checks.filter((r) => !r.pass);

  if (routing_fails.length || skills_fails.length || rag_fails.length || sentinel_fails.length || agent_fails.length || life_fails.length) {
    console.log("\n  ── Failures ─────────────────────────────────────────────");
    routing_fails.forEach((r)  => console.log(`  [ROUTING]  "${r.prompt}" → got ${r.got}, expected ${r.expected}`));
    skills_fails.forEach((r)   => {
      if (r.misses.length)       console.log(`  [SKILLS miss]   "${r.prompt}" → missed: ${r.misses.join(", ")}`);
      if (r.false_positives.length) console.log(`  [SKILLS fp]  "${r.prompt}" → false+: ${r.false_positives.join(", ")}`);
    });
    rag_fails.forEach((r)      => console.log(`  [RAG]      "${r.query}" → got [${r.retrieved.join(", ")}], want [${r.relevant_sources.join(", ")}]`));
    sentinel_fails.forEach((r) => console.log(`  [SENTINEL] "${r.label}" → got ${r.got}, expected ${r.expected}`));
    agent_fails.forEach((r)    => console.log(`  [AGENT]    "${r.label}" → failed checks: ${r.checks.filter((c) => !c.pass).map((c) => c.name).join(", ")}`));
    life_fails.forEach((r)     => console.log(`  [LIFE]     "${r.name}" → got ${JSON.stringify(r.got)}, expected ${JSON.stringify(r.expected)}`));
  }

  // ── Overall score ─────────────────────────────────────────────────────────
  const overall = (routing.accuracy + skills.f1 + rag.mean_ndcg + sentinel.accuracy + agent.accuracy + life.accuracy) / 6;
  suite.overall = +overall.toFixed(4);
  suite.timestamp = new Date().toISOString();

  console.log("\n  ══════════════════════════════════════════");
  console.log(`  Overall score:  ${bar(overall)} ${pct(overall)}`);
  console.log("  ══════════════════════════════════════════\n");

  // ── Save results ──────────────────────────────────────────────────────────
  fs.writeFileSync(OUT_FILE, JSON.stringify(suite, null, 2));
  console.log(`  Results saved → benchmark/results.json`);
  console.log(`  Run benchmark/analyze.m in MATLAB to visualize.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
