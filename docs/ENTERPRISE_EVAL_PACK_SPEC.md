# Enterprise RAG Eval Pack Spec

## Existing eval inventory

- LLM judge metrics: grounded claim rate, unsupported claim rate, contradiction rate, completeness, answer relevance, context relevance, context recall, format validity, low-evidence calibration.
- Deterministic checks: citation coverage, citation integrity, citation misattribution, must-cite, refusal behavior, format compliance, length bounds.
- Retrieval/tool/perf telemetry: chunk counts, source counts, similarity, latency, tokens, cost, tool retries, tool failures.
- Regression cockpit: pass-rate and key metric deltas across runs.

## Gap analysis (13 missing/partial enterprise checks)

- Retrieval explainability: evidence coverage map, evidence sufficiency, multi-hop trace.
- User usefulness: directness, actionability, clarity/cognitive-load, follow-up quality.
- Enterprise trust: source scope enforcement, missing-data hallucination guard, PII/secrets leak guard.
- Reliability: stability under repeated runs, retrieval drift monitoring.
- UI/debug explainability: citation UI readiness, debug panel completeness.

## Enterprise eval pack metrics and thresholds

- Evidence coverage score >= 0.85
- Evidence sufficiency score >= 0.70
- Multi-hop trace score >= 0.80
- Directness score >= 0.75
- Actionability score >= 0.70
- Clarity score >= 0.70 with bullet count in [3,7]
- Follow-up quality score >= 0.80
- Source scope pass = true
- Missing-data hallucination pass = true
- PII leak pass = true
- Stability variance < 0.15
- Retrieval drift score >= 0.80
- Citation UI readiness score >= 0.90
- Debug panel completeness score >= 0.85

Each metric stores:

- score (0-1 where applicable)
- pass/fail
- rationale
- evidence/details JSON
- replyId and/or runId linkage

## Storage model

- New table: `enterprise_eval_artifacts`
- Includes per-metric scores/pass/rationale/details and aggregate `overall_score`/`overall_pass`
- Indexed by `reply_id`, `run_id`, and `created_at`

## How to run

- API: `POST /api/admin/run-enterprise-eval-pack`
  - body: `{ "queryIds": [1,2,3], "repeatCount": 3 }` (both optional)
- CLI:
  - `npx tsx scripts/runEnterpriseEvalPack.ts --queries=all --repeats=3`
  - `npx tsx scripts/runEnterpriseEvalPack.ts --queries=1,2,3 --repeats=1`

## Admin surfaces

- `/admin/evals` run detail includes enterprise pack summary and per-artifact rows.
- `/admin/chats` overview includes enterprise pass, hallucination avoidance, and citation UI readiness cards.
- `/admin/chats/:chatId/replies/:replyId` includes enterprise eval payload on reply detail.
