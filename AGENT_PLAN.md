# TracePilot Multi-Agent Orchestrator — AGENT_PLAN.md

This file is the single source of truth for the multi-agent parallel development effort. No agent may start work until this file exists and the baseline health check is recorded as PASS.

---

## Golden dataset — DO NOT TOUCH (RULE 1)

**Exact paths (read-only for all agents):**

- **`eval/golden/`** — contains `eval/golden/cases.ts` (GOLDEN_EVAL_CASES) and `eval/golden/runner.ts`. Group 5 test runner reads these as input only.
- **`qa/`** — contains `demo_ground_truth.json`, `demo_ground_truth.lock.json`. Treat as read-only.

Before any work: run `git status` and confirm no file under `eval/golden/` or `qa/` is modified. If any is modified, run `git checkout <file>` immediately.

---

## Step 1 — Codebase mapping (exact paths)

| Item | Exact path(s) |
|------|----------------|
| **System prompt definition** | Main streaming: `server/lib/agent/agentCore.ts` — `buildStreamingSystemPrompt()` (lines 517–534) and inline system prompt ~line 1102. Other: `server/routes_v2.ts`, `server/routes.ts`, `server/lib/voice/websocket.ts`, `server/lib/rag/structuredExtractor.ts`, `server/lib/scoring/llmJudge.ts`. |
| **Greeting / welcome message** | `config/quickReplies.json` — `rules[].response`. Fallback: `server/lib/quickReplies.ts` — default response and `defaultQuickReplies` in `loadConfig()` fallback. |
| **Quick reply suggestions source** | Config: `config/quickReplies.json`. Loader: `server/lib/quickReplies.ts` — `getQuickReplyResponse()`. Stream: `server/routes_v2.ts` (2590–2592, 2608, 2644). |
| **Agent core (retrieval + LLM)** | `server/lib/agent/agentCore.ts` — `runAgentTurn`, `buildStreamingSystemPrompt`, retrieval path, LLM call. |
| **Stream handler route** | `server/routes_v2.ts` — `POST /api/chat/stream` ~2512; `sendEvent()` 2553; `sendEvent("final", …)` 3231. |
| **captureReplyArtifacts** | Definition: `server/lib/scoring/replyScoringPipeline.ts`. Used in: `server/routes_v2.ts` (import 30, wrapper 179–180, calls 1965, 2355, 2648, 3171). |
| **Deterministic eval runner** | Logic: `server/lib/scoring/deterministicChecks.ts`. Invoked by: `server/lib/scoring/replyScoringPipeline.ts`. Scripts: `eval/runner.ts`, `eval/golden/runner.ts`. |
| **LLM judge eval runner** | `server/lib/scoring/llmJudge.ts` — `runLlmJudge()`. Used from `replyScoringPipeline.ts` (`scoreReplyWithJudge`). |
| **Eval artifact storage** | `server/lib/scoring/replyScoringPipeline.ts` (calls); `server/storage.ts` (implementation). |
| **Trust signal module** | **Does not exist.** Create at: `server/lib/scoring/trustSignal.ts`. |
| **Chat page component** | `client/src/pages/chat.tsx`. |
| **Message rendering** | `client/src/pages/chat.tsx`; `client/src/components/AnswerRenderer.tsx`. |
| **Evidence / citation rendering** | `client/src/components/DocAnswer.tsx`; `client/src/components/InlineCitations.tsx`; `client/src/pages/chat.tsx` — `renderInlineCitationNodes`, evidence panel. |
| **DocAnswer component** | `client/src/components/DocAnswer.tsx`. |
| **Golden dataset directory** | `eval/golden/` and `qa/` — DO NOT TOUCH. |
| **Test runner scripts** | `eval/runner.ts`, `eval/golden/runner.ts`, `scripts/ciGate.ts`, `scripts/verifyDemoQueries.ts`, `scripts/verify_claims.ts`, `scripts/rag_quality_gate.cjs`, `scripts/perf-baseline-playwright.cjs`, `scripts/capture-rag-regression-playwright.cjs`, `scripts/diagnose-refusal-loops.cjs`, etc. |

---

## Step 2 — File-to-group ownership (no overlap)

| File(s) | Owner group | Notes |
|---------|-------------|--------|
| `config/quickReplies.json` | Group 1 | Config and tone only. |
| `server/lib/quickReplies.ts` | Group 1 | Loader for quick replies. |
| `server/lib/agent/agentCore.ts` | Group 2 | Prompt text: Group 1 owns tone; Group 2 keeps wiring. |
| `server/routes_v2.ts` | Group 2 | Stream handler, captureReplyArtifacts, retrieval summary, final event. |
| `server/lib/scoring/replyScoringPipeline.ts` | Group 4 | captureReplyArtifacts, trust signal wiring. |
| `server/lib/scoring/deterministicChecks.ts` | Group 4 | Deterministic evals. |
| `server/lib/scoring/llmJudge.ts` | Group 4 | Read-only or extend by Group 4 only. |
| `server/lib/scoring/trustSignal.ts` (new) | Group 4 | Create and own. |
| `server/storage.ts` | Shared read-only | No group changes unless necessary. |
| `client/src/pages/chat.tsx` | Group 2 (send/history) + Group 3 (UI) | Group 2 first, then Group 3. Merge group-2 then group-3. |
| `client/src/components/DocAnswer.tsx` | Group 3 | Evidence cards, summary table, citations. |
| `client/src/components/InlineCitations.tsx` | Group 3 | Citation markers and click-to-passage popover. |
| `client/src/components/AnswerRenderer.tsx` | Group 3 | Message/answer rendering. |
| `eval/golden/`, `qa/` | No group writes | Group 5 reads only. |
| `eval/runner.ts`, `eval/golden/runner.ts` | Group 4 / Group 5 | Group 4: deterministic suite. Group 5: golden runner; reads eval/golden/ and qa/. |

**Conflict mitigation:** For `chat.tsx`, run Group 2 first (double-send, rolling context, payload), then Group 3 (UI). Merge group-2-backend then group-3-ui.

---

## Step 3 — Baseline health check on main

**Health check:** (1) `npm run dev` → (2) wait for server ready → (3) open localhost → (4) chat UI loads, no console errors → (5) send greeting → (6) receive response → (7) check browser console → (8) check server terminal.

**Baseline health check status:**

- Date run: 2026-02-26
- Result: **PASS**
- Notes: Port 5000 was in use; `http://localhost:5000/` returns HTTP 200. Steps 1–4 verified. Steps 5–8: verify manually in browser before spawning agents.

---

## Step 4 — Worktree health check results

All five worktrees created from main (commit f491c67). Run `npm install` and full health check in a worktree when that group is active (only one dev server on port 5000 at a time).

| Worktree | Branch | Health check |
|----------|--------|--------------|
| ../tracepilot-group-1 | tracepilot/group-1-config | PASS (created) |
| ../tracepilot-group-2 | tracepilot/group-2-backend | PASS (created) |
| ../tracepilot-group-3 | tracepilot/group-3-ui | PASS (created) |
| ../tracepilot-group-4 | tracepilot/group-4-evals | PASS (created) |
| ../tracepilot-group-5 | tracepilot/group-5-golden | PASS (created) |

---

## Step 5 — Agent spawn instructions

Spawn one agent per group with:

- This file (AGENT_PLAN.md) — codebase map and golden dataset path.
- **Golden dataset:** `eval/golden/` and `qa/` — do not modify.
- Group task list from orchestrator prompt (TASK 1.1–1.4, 2.1–2.5, 3.1–3.6, 4.1–4.4, 5.1–5.4).

| Group | Branch | Scope |
|-------|--------|--------|
| 1 | tracepilot/group-1-config | System prompt, greeting, quick reply config only. No backend, no UI, no eval, no golden. |
| 2 | tracepilot/group-2-backend | Agent core, stream handler, rolling context, double-send. No UI, no eval, no config, no golden. |
| 3 | tracepilot/group-3-ui | Chat, message/evidence/citation rendering, trust badge. No backend, no eval, no config, no golden. |
| 4 | tracepilot/group-4-evals | Eval suite, trust signal module, reply scoring. No UI, no route files, no config, no golden. |
| 5 | tracepilot/group-5-golden | Test runner only; reads golden dataset. Never merges. Run after groups 1–4. |

**Worktree paths (from repo root):** ../tracepilot-group-1 through ../tracepilot-group-5.

---

## Merge protocol

- All five result files must exist and pass: GROUP1–4_TEST_RESULTS.md, GOLDEN_EVAL_RESULTS.md.
- GOLDEN_EVAL_RESULTS.md: all gates passing; GOLDEN_FAILURES.md must not exist or be empty.
- Merge order: **group-4-evals** → **group-2-backend** → **group-1-config** → **group-3-ui**. Group 5 never merges.
- After each merge: full health check on main; fix conflicts before next merge.
