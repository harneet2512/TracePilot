# TracePilot — Agent Plan (Single Source of Truth)

This document is the single source of truth for the 16-goal verification and baseline health. It includes startup commands, health checklist, full Goal Spec Sheet for all 16 goals, self-diagnostic loop, and repeatability requirement.

---

## Golden dataset — DO NOT TOUCH (RULE 1)

- **`eval/golden/`** — `eval/golden/cases.ts` (GOLDEN_EVAL_CASES), `eval/golden/runner.ts`. Read-only.
- **`qa/`** — `demo_ground_truth.json`, `demo_ground_truth.lock.json`. Read-only.
- Do not modify golden dataset content. Manual golden UI testing uses these questions only.

---

## Startup commands (from package.json / README)

| Step | Command | Notes |
|------|---------|--------|
| Install | `npm install` | Repo root |
| DB (SQLite) | `npm run db:push:sqlite` then `npm run db:doctor` | No Docker |
| DB (Docker Postgres) | `docker compose up -d` then set `DATABASE_URL` (e.g. `postgresql://postgres:postgres@localhost:5433/tracepilot_test`) then `npm run db:push` then `npm run db:doctor` | |
| Dev server | `npm run dev` or `npm run dev:dotenv` | From repo root; server typically port 5000 |
| Worker (optional) | `npm run worker` | For async jobs |
| Eval | `npm run eval` | Golden groundedness (eval/golden/runner.ts) |
| CI gate | `npm run ci` | scripts/ciGate.ts (eval suites + baseline) |

---

## Health check checklist (repeatable)

1. **DB:** `npm run db:doctor` exits 0.
2. **App:** `npm run dev` (or `npm run dev:dotenv`) starts; no bind error; listen on port 5000.
3. **Browser:** Open http://localhost:5000; UI loads.
4. **Auth:** After login, **GET /api/auth/me** → 200 (network receipt).
5. **Chat stream:** **POST /api/chat/stream** → 200 and response streams (no CSRF 403).
6. **Repeatability:** Restart app three times; after each restart re-check steps 4–5. All three runs must succeed.

---

## Self-diagnostic loop (mandatory)

For any failure:

1. **Reproduce** in live browser (or existing Playwright if applicable).
2. **Capture receipts:** Network (endpoint, method, status, response snippet), Console (error stack, file, line), screenshot notes.
3. **Root cause:** auth/session/CSRF, retrieval/vector store, formatting/payload contract, UI render, etc.
4. **Smallest safe fix** (no hardcoding; use config/constants).
5. **Re-run** baseline health and the specific goal verification; log in LOCAL_CHANGES.md and UI_RECEIPTS.md.

---

## Repeatability requirement

After all goals show PASS in UI_RECEIPTS.md:

- Restart the app stack **three times**.
- After each restart: GET /api/auth/me 200 after login; POST /api/chat/stream 200 streaming; **one golden question end-to-end with citations**.
- Log results in UI_RECEIPTS.md (e.g. "Repeatability run 1/2/3: …").

---

## File map (exact paths)

| Item | Path(s) |
|------|--------|
| System prompt | `server/lib/agent/agentCore.ts` — `buildStreamingSystemPrompt()`. Also `server/routes_v2.ts`, `server/routes.ts`, `server/lib/voice/websocket.ts`. |
| Greeting / quick replies | `config/quickReplies.json`; loader `server/lib/quickReplies.ts`. |
| captureReplyArtifacts | `server/lib/scoring/replyScoringPipeline.ts`; used in `server/routes_v2.ts`. |
| Stream handler | `server/routes_v2.ts` — `POST /api/chat/stream`. |
| Chat client | `client/src/pages/chat.tsx`. |
| Eval / golden | `eval/runner.ts`, `eval/golden/runner.ts`, `eval/golden/cases.ts`; deterministic `server/lib/scoring/deterministicChecks.ts`. |
| Agent core | `server/lib/agent/agentCore.ts` — `runAgentTurn`, retrieval, zero-chunk guard, LLM. |
| Evidence / citation UI | `client/src/components/DocAnswer.tsx`; `client/src/pages/chat.tsx` (CitationPopover, evidence panel). |
| Admin reply detail | `server/routes_v2.ts` — **GET /api/admin/chats/:chatId/replies/:replyId**. This route **exists and was introduced/added during this verification effort** (admin reply detail). Response includes **deterministicChecks** (abstentionPass, ownerCitationPass, deadlineCitationPass, retrievalRecallPass). Route is protected by authMiddleware; only chat owner or admin may access (403 for other users). |

---

## Goal Spec Sheet (all 16 goals)

For each goal: **A)** Goal statement **B)** Done criteria **C)** Code touchpoints **D)** Live UI verification steps **E)** Required receipts **F)** Pass metrics **G)** Common failure modes + diagnostic actions.

---

### Goal 1: Double-send bug fixed

- **A) Goal statement:** One user action results in exactly one POST to /api/chat/stream and exactly one assistant message.
- **B) Done criteria:** Single Send click or Enter yields one request; double-click/Enter spam does not duplicate requests or messages.
- **C) Code touchpoints:** `client/src/pages/chat.tsx` — `isSendingRef`, `handleSend`, `handleSendQuickReply`, mutation `onSettled` reset. Existing test: `tests/no-duplicate-send.spec.ts`.
- **D) Live UI verification steps:** (1) Open chat. (2) Type a message; click Send once. (3) In Network tab, filter by /api/chat/stream; confirm exactly one POST for that send. (4) Repeat with rapid double-click on Send; confirm at most one POST. (5) Repeat with rapid Enter key; confirm at most one POST.
- **E) Required receipts:** Network: endpoint POST /api/chat/stream, count of requests per send action. Console: no errors. Screenshot: message list shows one assistant reply per send.
- **F) Pass metrics:** For a single send, Network shows exactly 1 request; double-click/Enter spam does not duplicate.
- **G) Common failure modes:** Race where mutation fires twice before ref is set — ensure ref is set synchronously before mutate. Diagnostic: capture request count and timestamps in Network tab.

---

### Goal 2: Field-Copilot replaced with TracePilot everywhere

- **A) Goal statement:** No "Field-Copilot" text in UI, greetings, prompts, or configs; branding is TracePilot.
- **B) Done criteria:** Grep/search finds no user-facing "Field-Copilot" or "TracePilot"; UI (title, greeting, answer text) shows TracePilot.
- **C) Code touchpoints:** `server/lib/agent/agentCore.ts` — RESPONSE_STYLE_RULES; `config/quickReplies.json`; page title in client (e.g. index.html or layout).
- **D) Live UI verification steps:** (1) Grep codebase for "Field-Copilot" and "TracePilot" in client, config, agent prompts. (2) Open app; check document title and visible header/greeting. (3) Send a message; confirm answer text does not mention Field-Copilot.
- **E) Required receipts:** Grep result (no hits in user-facing paths). Screenshot: page title and greeting show TracePilot.
- **F) Pass metrics:** No "Field-Copilot" in UI; screenshot shows TracePilot.
- **G) Common failure modes:** Leftover strings in quickReplies or system prompt. Diagnostic: search server/lib/agent, config, client src for branding strings.

---

### Goal 3: Enterprise system prompt behavior implemented

- **A) Goal statement:** Answers lead with a single insight sentence, interpret deadlines with urgency, surface downstream risk, end with a specific next step, follow required structure.
- **B) Done criteria:** For a known governance question (e.g. from golden cases), output structure appears in correct order: insight first, then bullets with [N], then next step; summary table has Priority and Impact populated.
- **C) Code touchpoints:** `server/lib/agent/agentCore.ts` — `buildStreamingSystemPrompt()`, `RESPONSE_STYLE_RULES`, `STRUCTURED_CONTEXT_INSTRUCTION`.
- **D) Live UI verification steps:** (1) Ask one golden question (e.g. "What are our Q4 OKRs for the AI search project?"). (2) Confirm answer leads with one insight sentence (no "Based on..." opener). (3) Confirm bullets with [N] citations. (4) Confirm specific follow-up at end. (5) If summary table present, confirm Priority and Impact columns populated.
- **E) Required receipts:** Screenshot or copy of answer showing structure. Network: POST /api/chat/stream 200; response includes structured sections if applicable.
- **F) Pass metrics:** For a known governance question, output structure always appears in correct order; Priority/Impact in table not blank.
- **G) Common failure modes:** Prompt not injected or overridden. Diagnostic: inspect buildStreamingSystemPrompt output and LLM response shape.

---

### Goal 4: Zero-chunk guard abstention

- **A) Goal statement:** When no relevant chunks, the system abstains safely, asks clarifying questions, and does not emit hallucinated owners/dates or citations.
- **B) Done criteria:** Query that matches no docs returns abstention message + clarifying questions; no confident factual claims; no citations for that reply.
- **C) Code touchpoints:** `server/lib/agent/agentCore.ts` — zero-chunk path (no LLM when relevantChunks.length === 0); `server/routes_v2.ts` — GENERAL path abstention; `server/lib/scoring/deterministicChecks.ts` — `abstentionPass`.
- **D) Live UI verification steps:** (1) Ask an out-of-domain question (e.g. "What is the capital of Mars?" or unrelated to seeded docs). (2) Confirm response is abstention + clarifying questions. (3) In network or response payload, confirm chunks/retrieved count is 0. (4) Confirm no citations shown.
- **E) Required receipts:** Network payload shows zero chunks; UI shows abstention message; no citations emitted.
- **F) Pass metrics:** Network payload shows zero chunks; UI shows abstention; no citations unless legitimate.
- **G) Common failure modes:** LLM called anyway with empty context; generic fallback not marked as abstention. Diagnostic: log retrieval count and response path in backend; run deterministic check with chunks=0 and factual answer to see abstentionPass false.

---

### Goal 5: Rolling context for follow-ups

- **A) Goal statement:** "Elaborate on that" references prior answer correctly and does not reset context.
- **B) Done criteria:** Second turn POST includes conversationHistory with length > 0; second reply is contextually relevant to first.
- **C) Code touchpoints:** `client/src/pages/chat.tsx` — `conversationHistory` built from last 20 messages, sent in POST body to `/api/chat/stream`.
- **D) Live UI verification steps:** (1) Send first message (e.g. a golden question). (2) Wait for reply. (3) Send follow-up "Who owns this?" or "Elaborate on that." (4) In Network tab, inspect follow-up POST body; confirm conversationHistory array has at least two entries (user + assistant). (5) Confirm second reply references first (e.g. owner or topic from first answer).
- **E) Required receipts:** Network: POST body for follow-up includes conversationHistory with length > 0. UI: second reply ties back to first.
- **F) Pass metrics:** Second turn response explicitly ties back; no generic restart.
- **G) Common failure modes:** conversationHistory not sent or truncated. Diagnostic: log POST body in client or inspect in DevTools.

---

### Goal 6: Evidence cards UI

- **A) Goal statement:** Evidence renders as horizontal compact cards with excerpt + Open at bottom.
- **B) Done criteria:** After a doc-backed answer, evidence appears as horizontal compact cards; each card has excerpt and Open link; no table fallback for evidence list; no raw chunkId/sourceId in card text.
- **C) Code touchpoints:** `client/src/components/DocAnswer.tsx` — EvidenceList (horizontal flex, compact cards, Open link).
- **D) Live UI verification steps:** (1) Ask a question that returns doc-backed answer with sources. (2) Scroll to evidence section. (3) Confirm layout is horizontal compact cards. (4) Confirm each card has excerpt and Open. (5) Confirm no raw IDs in card text; no table used for evidence list.
- **E) Required receipts:** Screenshot: cards visible; Open works. No table fallback.
- **F) Pass metrics:** Cards are visible; Open works; no table fallback.
- **G) Common failure modes:** Evidence list not passed or wrong shape; fallback to table. Diagnostic: inspect response.sources/evidence and DocAnswer props.

---

### Goal 7: Trust badge skeleton → final badge

- **A) Goal statement:** During streaming, skeleton badge visible; resolves to Grounded/Review/Warning when final event arrives.
- **B) Done criteria:** While streaming, skeleton (e.g. placeholder pill) visible; when stream completes, final trust badge (Grounded/Review/Warning) shown with correct styling.
- **C) Code touchpoints:** `client/src/pages/chat.tsx` — streaming state `data-testid="trust-badge-skeleton"`; complete state `response.trustSignal`; `server/lib/scoring/trustSignal.ts` — `computeTrustSignal()`.
- **D) Live UI verification steps:** (1) Send a message. (2) During streaming, confirm skeleton element visible (e.g. trust-badge-skeleton). (3) When complete, confirm badge shows Grounded or Review or Warning. (4) Confirm badge has distinct styling (color/label).
- **E) Required receipts:** Screenshot: skeleton during stream; final badge after complete. Console: no errors.
- **F) Pass metrics:** Badge appears within 200ms of stream start (skeleton or final); resolves on final event.
- **G) Common failure modes:** trustSignal not in response; skeleton not shown. Diagnostic: check message.response.trustSignal and streaming vs complete render path.

---

### Goal 8: Trust badge click-through by requestId

- **A) Goal statement:** Clicking badge opens eval detail if route exists; if not, click disabled and logs why.
- **B) Done criteria:** Click trust badge on completed reply → navigates to /admin/chats/<conversationId>/replies/<replyId>; URL matches conversation and reply. If route or ids missing, click disabled or logs reason.
- **C) Code touchpoints:** `client/src/pages/chat.tsx` — `<a href={/admin/chats/${conversationId}/replies/${replyId}}>`; `client/src/App.tsx` — route `/admin/chats/:chatId/replies/:replyId`; `server/routes_v2.ts` — GET /api/admin/chats/:chatId/replies/:replyId.
- **D) Live UI verification steps:** (1) Send message; wait for complete reply with trust badge. (2) Click trust badge. (3) Confirm navigation to /admin/chats/<id>/replies/<replyId>. (4) Confirm page loads (eval detail). (5) If no replyId/conversationId, confirm badge not clickable or console log explains.
- **E) Required receipts:** URL after click; page load. No broken navigation.
- **F) Pass metrics:** No broken navigation; clear diagnostic if click disabled.
- **G) Common failure modes:** replyId or conversationId not set; link wrong. Diagnostic: log ids when rendering badge; verify route exists in App.tsx.

---

### Goal 9: Clickable inline citations popover

- **A) Goal statement:** Clicking [1] opens popover with exact cited passage; closes on ESC/click outside.
- **B) Done criteria:** Answer shows [1], [2] etc.; click citation opens popover with source info and cited snippet; popover closes on ESC or click outside; no broken or missing citation nodes.
- **C) Code touchpoints:** `client/src/pages/chat.tsx` — `CitationPopover`, `renderInlineCitationNodes`.
- **D) Live UI verification steps:** (1) Get answer with inline citations [1], [2]. (2) Click [1]; confirm popover opens with content. (3) Confirm popover shows cited passage/snippet. (4) Press ESC or click outside; confirm popover closes. (5) Repeat for [2]; confirm no broken refs.
- **E) Required receipts:** Screenshot: popover open with content. Popover content matches cited snippet.
- **F) Pass metrics:** Popover content matches cited snippet.
- **G) Common failure modes:** citations array index mismatch; snippet not passed. Diagnostic: ensure citation index 0-based in code matches 1-based [1] in text.

---

### Goal 10: Retrieval summary one-liner

- **A) Goal statement:** "Searched N chunks from M sources · Best match X" appears when retrievalSummary exists and matches payload.
- **B) Done criteria:** After doc-backed reply, one-liner visible (e.g. N chunks, M sources, best match X%); numbers consistent with final event payload.
- **C) Code touchpoints:** `client/src/components/DocAnswer.tsx` — retrieval summary (chunksConsidered, distinctSources, topSimilarityScore); `client/src/pages/chat.tsx` for legacy bullets path.
- **D) Live UI verification steps:** (1) Ask question that returns doc-backed answer. (2) Locate retrieval summary line near answer. (3) Confirm N, M, X present. (4) Optionally compare with final stream event or response payload for consistency.
- **E) Required receipts:** Screenshot: one-liner visible. Numbers consistent with payload.
- **F) Pass metrics:** Numbers consistent with final event payload.
- **G) Common failure modes:** retrievalSummary not passed or key names differ. Diagnostic: inspect response.retrievalSummary or equivalent in stream payload.

---

### Goal 11: Deterministic abstention eval

- **A) Goal statement:** Eval fails if chunks=0 but answer makes factual claims.
- **B) Done criteria:** When chunk count is 0, abstentionPass is true only if answer has no substantive factual claims; otherwise eval fails with abstention_factual_claims_with_zero_chunks in failedChecks.
- **C) Code touchpoints:** `server/lib/scoring/deterministicChecks.ts` — `abstentionPass`, `hasSubstantiveFactualClaims`; `server/lib/scoring/replyScoringPipeline.ts` calls `runDeterministicChecks`. Golden runner does not currently output abstentionPass.
- **D) Live UI verification steps:** (1) Run `server/__tests__/scoring.test.ts` (deterministic checks). (2) In UI: trigger zero-chunk query; confirm abstention and no factual claims. (3) Optionally: verify reply pipeline stores deterministic result and that abstentionPass is set correctly (e.g. in admin reply detail).
- **E) Required receipts:** Unit test pass. UI: zero-chunk reply abstains. Eval or pipeline output shows abstentionPass when run with zero chunks (if available).
- **F) Pass metrics:** Deterministic check exists and fails when chunks=0 and answer has factual claims.
- **G) Common failure modes:** Golden runner does not call runDeterministicChecks. Diagnostic: reply pipeline does call it; verify via admin reply detail or by adding log in captureReplyArtifacts.

---

### Goal 12: Owner-in-cited-source eval

- **A) Goal statement:** If answer names an owner, owner string must appear in cited chunk text or eval fails.
- **B) Done criteria:** Answer with owner mention → ownerCitationPass true only when that owner appears in cited chunk snippets; otherwise false and owner_not_in_cited_chunks in failedChecks.
- **C) Code touchpoints:** `server/lib/scoring/deterministicChecks.ts` — `ownerCitationPass`, `extractOwnerMentions`; used in replyScoringPipeline.
- **D) Live UI verification steps:** (1) Run unit test for deterministic checks with owner in answer. (2) In UI: ask golden question that returns owner (e.g. q4-aws-owner-deadline); confirm owner in cited snippet or check admin reply detail for ownerCitationPass.
- **E) Required receipts:** Unit test or pipeline result: ownerCitationPass true/false as expected; failedChecks when owner not in cited text.
- **F) Pass metrics:** Owner in answer → must appear in cited chunk text or eval fails.
- **G) Common failure modes:** extractOwnerMentions misses name; cited snippets not passed. Diagnostic: log extracted owners and allCitedText in runDeterministicChecks.

---

### Goal 13: Deadline-in-cited-source eval

- **A) Goal statement:** If answer states a date/deadline, it must appear in cited chunk text or eval fails.
- **B) Done criteria:** Answer with date/deadline → deadlineCitationPass true only when that date appears in cited chunk snippets; otherwise false and deadline_not_in_cited_chunks in failedChecks.
- **C) Code touchpoints:** `server/lib/scoring/deterministicChecks.ts` — `deadlineCitationPass`, `extractDateMentions`.
- **D) Live UI verification steps:** (1) Run unit test with date in answer. (2) In UI: ask golden question with deadline (e.g. q4-aws-owner-deadline); confirm date in cited snippet or check deterministic result.
- **E) Required receipts:** Unit test or pipeline: deadlineCitationPass consistent with date in cited text.
- **F) Pass metrics:** Date in answer → must appear in cited chunk text or eval fails.
- **G) Common failure modes:** Date format mismatch; extractDateMentions misses format. Diagnostic: normalize date formats in comparison.

---

### Goal 14: Retrieval recall @K

- **A) Goal statement:** When golden provides expected chunk IDs, retrieval includes at least one expected ID in top-K.
- **B) Done criteria:** When expectedChunkIds supplied to runDeterministicChecks, retrievalRecallPass true iff at least one expected id in retrieved set; else retrieval_recall_expected_chunk_missing in failedChecks. Golden cases have expectedSourcePrefixes but no expectedChunkIds; verification via code + unit test or pipeline that supplies expectedChunkIds.
- **C) Code touchpoints:** `server/lib/scoring/deterministicChecks.ts` — `retrievalRecallPass`; input `expectedChunkIds`. Golden runner does not pass expectedChunkIds.
- **D) Live UI verification steps:** (1) Confirm in code that retrievalRecallPass uses expectedChunkIds. (2) Run unit test that supplies expectedChunkIds and retrievedChunks; confirm pass/fail. (3) If golden runner extended to pass expectedChunkIds without changing case content, run and log recall result.
- **E) Required receipts:** Code review; unit test or pipeline output for retrievalRecallPass.
- **F) Pass metrics:** When expectedChunkIds provided, at least one in top-K.
- **G) Common failure modes:** Golden runner never passes expectedChunkIds. Diagnostic: add optional expectedChunkIds to golden case metadata (without changing query/expectedFacts) if needed for reporting only.

---

### Goal 15: Thumbs up/down feedback end-to-end

- **A) Goal statement:** Clicking thumbs triggers POST /api/chat/feedback 200 and persists feedback for that message.
- **B) Done criteria:** After reply, thumbs up/down visible; click sends POST /api/chat/feedback with 200; refresh shows state retained.
- **C) Code touchpoints:** `client/src/pages/chat.tsx` — FeedbackButtons; `server/routes_v2.ts` — POST /api/chat/feedback (auth, merge userFeedback into message metadata).
- **D) Live UI verification steps:** (1) Send message; wait for reply. (2) Confirm thumbs up/down visible. (3) Click thumbs up; in Network tab confirm POST /api/chat/feedback 200. (4) Refresh page; confirm feedback state retained (e.g. thumb still selected or persisted in UI).
- **E) Required receipts:** Network: POST /api/chat/feedback 200. Refresh shows state retained.
- **F) Pass metrics:** Network 200; refresh shows state retained.
- **G) Common failure modes:** CSRF 403; replyId/requestId wrong; metadata not merged. Diagnostic: check auth and body; storage.getMessage and merge logic.

---

### Goal 16: Summary table Priority + Impact always populated

- **A) Goal statement:** Every summary row has Priority and Impact filled; not blank; table not verbatim duplicate of prose.
- **B) Done criteria:** Summary table rows show Priority and Impact (or "—"/UNAVAILABLE); no empty cells; content differs from prose.
- **C) Code touchpoints:** `client/src/components/DocAnswer.tsx` — table, PriorityPill, Impact column, UNAVAILABLE; `server/lib/agent/agentCore.ts` — prompt requires Priority/Impact in tables.
- **D) Live UI verification steps:** (1) Ask question that returns summary table (e.g. OKRs, roadmap). (2) Inspect each row: Priority and Impact columns have value or "—"/UNAVAILABLE. (3) Confirm no blank cells. (4) Confirm table is not verbatim copy of prose above.
- **E) Required receipts:** Screenshot: table with Priority and Impact populated. No "—" for both if data exists; no empty cells.
- **F) Pass metrics:** No "—" or empty cells; content differs from prose.
- **G) Common failure modes:** LLM omits Priority/Impact; UI does not render UNAVAILABLE. Diagnostic: tighten prompt; ensure DocAnswer maps missing to UNAVAILABLE.

---

## Execution order (summary)

1. **Phase 0** — Start DB + app; live browser baseline health (UI load, GET /api/auth/me 200, POST /api/chat/stream 200 streaming); record in UI_RECEIPTS.md; if FAIL, self-diagnostic loop.
2. **Repeatability (Phase 0)** — Restart app three times; re-check auth and stream each time; log in UI_RECEIPTS.md.
3. **Goals 1–16** — Goal-by-goal live UI verification; capture receipts; set PASS/FAIL in UI_RECEIPTS.md; update IMPLEMENTATION_STATUS.md only when PASS.
4. **Repeatability (final)** — After all PASS, three restarts + one golden E2E per restart; log in UI_RECEIPTS.md.
5. **LOCAL_CHANGES.md** — Append every change: Timestamp | File | What Changed | Why | Verified By.

---

## Fast-path smalltalk

- **What qualifies (config-driven):** Any message that matches `config/quickReplies.json` rules via `server/lib/quickReplies.ts` (`matchQuickReplyRule`). No inline greeting/thanks trigger lists in route code.
- **What is bypassed:** For matching rules in `POST /api/chat/stream`, backend returns immediately and skips retrieval/vector search, LLM generation, and deterministic scoring (`captureReplyArtifacts` path).
- **Response contract:** Sends normal stream events (`meta`, `delta`, `final`, `done`) with empty `citations/sources`, no `retrievalSummary`, no trust badge payload, and quick replies from config.
- **Persistence behavior:** Conversation/message rows are still created for continuity, but writes are done in a background async task so the user-visible response is not blocked.
- **How to verify:** In headed browser DevTools Network, send `hi/hello/thanks/ok` and confirm `/api/chat/stream` 200 with low TTFB/total time; in server logs confirm one-line decision logs `FAST_PATH=true/false durationMs ruleId=...` and absence of retrieval/LLM logs for fast-path turns.
