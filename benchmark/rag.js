import { retrieve } from "../core/rag.js";
import { RAG_CASES } from "./dataset.js";

// NDCG@k — normalized discounted cumulative gain
function ndcg(retrieved, relevant, k) {
  const rel_set = new Set(relevant);
  let dcg = 0;
  for (let i = 0; i < Math.min(retrieved.length, k); i++) {
    if (rel_set.has(retrieved[i])) dcg += 1 / Math.log2(i + 2);
  }
  // Ideal DCG: all relevant docs at top positions
  let idcg = 0;
  for (let i = 0; i < Math.min(relevant.length, k); i++) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg > 0 ? dcg / idcg : 0;
}

// MRR — mean reciprocal rank
function reciprocal_rank(retrieved, relevant) {
  const rel_set = new Set(relevant);
  for (let i = 0; i < retrieved.length; i++) {
    if (rel_set.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

// Hit@k — did any relevant doc appear in top k?
function hit_at_k(retrieved, relevant, k) {
  const rel_set = new Set(relevant);
  return retrieved.slice(0, k).some((s) => rel_set.has(s)) ? 1 : 0;
}

export async function runRagBenchmark() {
  const results  = [];
  let total_ndcg = 0;
  let total_mrr  = 0;
  let total_hit1 = 0;
  let total_hit3 = 0;

  for (const { query, relevant_sources } of RAG_CASES) {
    const start   = Date.now();
    const chunks  = await retrieve(query, 5, 0.0); // low threshold to capture all
    const latency = Date.now() - start;

    // Deduplicate by source — multiple chunks from the same file count once
    const seen      = new Set();
    const deduped   = chunks.filter((c) => seen.has(c.source) ? false : seen.add(c.source));
    const retrieved = deduped.map((c) => c.source);
    const scores    = deduped.map((c) => c.score);

    const ndcg_score = ndcg(retrieved, relevant_sources, 3);
    const mrr_score  = reciprocal_rank(retrieved, relevant_sources);
    const h1         = hit_at_k(retrieved, relevant_sources, 1);
    const h3         = hit_at_k(retrieved, relevant_sources, 3);

    total_ndcg += ndcg_score;
    total_mrr  += mrr_score;
    total_hit1 += h1;
    total_hit3 += h3;

    results.push({
      query:            query.slice(0, 60),
      relevant_sources,
      retrieved:        retrieved.slice(0, 3),
      scores:           scores.slice(0, 3),
      ndcg:             +ndcg_score.toFixed(4),
      mrr:              +mrr_score.toFixed(4),
      hit_at_1:         h1,
      hit_at_3:         h3,
      latency_ms:       latency,
    });
  }

  const n = RAG_CASES.length;
  return {
    component:    "rag",
    total:        n,
    mean_ndcg:    +(total_ndcg / n).toFixed(4),
    mean_mrr:     +(total_mrr  / n).toFixed(4),
    hit_at_1:     +(total_hit1 / n).toFixed(4),
    hit_at_3:     +(total_hit3 / n).toFixed(4),
    mean_latency: +(results.reduce((s, r) => s + r.latency_ms, 0) / n).toFixed(1),
    results,
  };
}
