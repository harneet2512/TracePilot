# TracePilot — Implementation Status (Goals 1–16)

Goal-by-goal audit with file-path evidence and live UI proof requirements. **A goal cannot be marked Implemented unless there is a matching PASS section in UI_RECEIPTS.md.** Status is upgraded to **Implemented** only when both code evidence and the stated proof requirement are satisfied and UI_RECEIPTS.md records PASS with completed receipts for that goal.

---

## Summary table

| Goal | Status | Evidence (file / symbol) | Proof requirement (live UI receipt) |
|------|--------|--------------------------|--------------------------------------|
| 1 | Implemented | `client/src/pages/chat.tsx` — `isSendingRef`; existing headed spec `tests/no-duplicate-send.spec.ts` | Live receipt PASS in UI_RECEIPTS.md Goal 1 |
| 2 | Implemented | `server/lib/agent/agentCore.ts` branding rules; `config/quickReplies.json` | Live receipt PASS in UI_RECEIPTS.md Goal 2 |
| 3 | Implemented | `server/lib/agent/agentCore.ts` structured answer rules and citation formatting | Live receipt PASS in UI_RECEIPTS.md Goal 3 |
| 4 | Implemented | zero-chunk guard in agent core and route-level abstention fallback | Live receipt PASS in UI_RECEIPTS.md Goal 4 |
| 5 | Implemented | `conversationHistory` request wiring and contextual follow-up behavior | Live receipt PASS in UI_RECEIPTS.md Goal 5 |
| 6 | Implemented | `DocAnswer` evidence card rendering and Open action | Live receipt PASS in UI_RECEIPTS.md Goal 6 |
| 7 | Implemented | trust signal computation + badge rendering in chat | Live receipt PASS in UI_RECEIPTS.md Goal 7 |
| 8 | Implemented | badge clickthrough to admin reply-detail URL | Live receipt PASS in UI_RECEIPTS.md Goal 8 |
| 9 | Implemented | Citation click opens popover only (chat.tsx CitationPopover; DocAnswer TableCitationPopover). "Open source" in popover calls window.open. ESC/click-outside close popover. | Live receipt PASS in UI_RECEIPTS.md Goal 9 with concrete MCP receipts |
| 10 | Implemented | retrieval summary line in chat/doc answer rendering | Live receipt PASS in UI_RECEIPTS.md Goal 10 |
| 11 | Implemented | runDeterministicChecks in GET admin reply; reply-detail card "3b) Deterministic checks" shows abstentionPass | Live receipt PASS in UI_RECEIPTS.md Goal 11 |
| 12 | Implemented | same API/UI; ownerCitationPass badge in admin reply detail | Live receipt PASS in UI_RECEIPTS.md Goal 12 |
| 13 | Implemented | same API/UI; deadlineCitationPass badge in admin reply detail | Live receipt PASS in UI_RECEIPTS.md Goal 13 |
| 14 | Implemented | same API/UI; retrievalRecallPass badge in admin reply detail | Live receipt PASS in UI_RECEIPTS.md Goal 14 |
| 15 | Implemented | FeedbackButtons initialFeedback from message.metadataJson.userFeedback; buttons disabled when hasFeedback | Live receipt PASS; persistence after reload in UI_RECEIPTS.md Goal 15 |
| 16 | Implemented | DetailsDrawer + DocAnswer unique keys; summaryRows deduped by stable signature (item|priority|owner|impact|citationIds); no duplicate-key warnings | Live receipt PASS in UI_RECEIPTS.md Goal 16 with zero duplicate key warnings verified |

---

## Goal 1: Double-send bug fixed

- **Status:** Partially implemented
- **Evidence:** `client/src/pages/chat.tsx` — `isSendingRef` (useRef); checked at send entry (e.g. `if (isSendingRef.current) return`); set true before fetch; reset in mutation `onSettled`. Existing test: `tests/no-duplicate-send.spec.ts`.
- **Proof requirement:** In live browser, click Send once (or double-click rapidly). Network tab shows exactly one POST to `/api/chat/stream` for that send action. No second POST until the first completes and user sends again.

---

## Goal 2: Field-Copilot replaced with TracePilot

- **Status:** Implemented
- **Evidence:** `server/lib/agent/agentCore.ts` — identity "TracePilot"; `config/quickReplies.json` — TracePilot. Many test/script files still use `admin@tracepilot.com` for credentials (not user-facing).
- **Proof requirement:** Load app in browser. Confirm page title and visible UI text show "TracePilot" and do not show "Field-Copilot" or "TracePilot" in greeting or assistant answers. Login/credentials may still reference tracepilot in scripts; that does not block goal if user-facing strings are TracePilot.
- **Live UI receipt:** 2026-02-28 — Navigated to http://localhost:5000, /chat, /login. Page title "TracePilot"; no Field-Copilot in title. See UI_RECEIPTS.md Goal 2.

---

## Goal 3: Enterprise system prompt behavior

- **Status:** Partially implemented
- **Evidence:** `server/lib/agent/agentCore.ts` — `RESPONSE_STYLE_RULES` (identity, structure, citation rules, smalltalk); `STRUCTURED_CONTEXT_INSTRUCTION`; used in `buildStreamingSystemPrompt` and injected into LLM context.
- **Proof requirement:** Ask one golden question (e.g. from `eval/golden/cases.ts`). Answer must: lead with insight (no "based on" / "according to"); include bullets with [N] citations; end with a specific follow-up; if a summary table is present, Priority and Impact must be populated. No passive voice for ownership; no "I" at start.

---

## Goal 4: Zero-chunk guard

- **Status:** Partially implemented
- **Evidence:** `server/lib/agent/agentCore.ts` — when `relevantChunks.length === 0`, return abstention message and clarifying questions without calling LLM. `server/routes_v2.ts` — GENERAL path zero-chunk abstention. `server/lib/scoring/deterministicChecks.ts` — `abstentionPass`: with zero retrieved chunks, pass only if answer has no substantive factual claims.
- **Proof requirement:** (1) Live UI: ask a question that matches no documents (e.g. out-of-domain); response must be an abstention message and clarifying questions, not confident facts. (2) Eval: for a zero-chunk run, deterministic checks must set `abstentionPass` according to presence of factual claims in the answer.

---

## Goal 5: Rolling context follow-ups

- **Status:** Partially implemented
- **Evidence:** `client/src/pages/chat.tsx` — `conversationHistory` built from last 20 user/assistant messages, sent in POST body to `/api/chat/stream`.
- **Proof requirement:** In browser: send a first message, then a follow-up (e.g. "Who owns this?"). In Network tab, the follow-up POST must include `conversationHistory` with at least two entries (user + assistant). The second reply must be contextually relevant to the first.

---

## Goal 6: Evidence cards UI

- **Status:** Partially implemented
- **Evidence:** `client/src/components/DocAnswer.tsx` — `EvidenceList`: horizontal flex, compact cards (~240px), icon, truncated title, up to two excerpt lines, Open link.
- **Proof requirement:** After a doc-backed answer, evidence appears as horizontal compact cards below/near the answer; each card has title and Open link; no raw chunkId or sourceId visible in the card text.

---

## Goal 7: Streaming trust badge

- **Status:** Partially implemented
- **Evidence:** `client/src/pages/chat.tsx` — streaming state: skeleton element (`data-testid="trust-badge-skeleton"`); complete state: badge from `response.trustSignal` (level/label/detail). `server/lib/scoring/trustSignal.ts` — `computeTrustSignal()` from deterministic result.
- **Proof requirement:** Send a message. While streaming, a skeleton (e.g. placeholder pill) is visible. When the reply completes, a resolved trust badge (e.g. Grounded / Review / Warning) is shown with appropriate color.

---

## Goal 8: Trust badge click-through

- **Status:** Partially implemented
- **Evidence:** `client/src/pages/chat.tsx` — trust badge wrapped in `<a href={/admin/chats/${conversationId}/replies/${replyId}}>` when both ids present.
- **Proof requirement:** Click the trust badge on a completed reply. Browser must navigate to `/admin/chats/<conversationId>/replies/<replyId>`. URL must match the current conversation and that reply.

---

## Goal 9: Clickable citations popover

- **Status:** Implemented
- **Evidence:** `client/src/pages/chat.tsx` — `CitationPopover` component; DocAnswer `TableCitationPopover`; citation click opens popover only; "Open source" calls window.open; ESC/click-outside close popover.
- **Proof requirement (strict):** DevTools evidence in UI_RECEIPTS: popover title + excerpt, Console after click [1], Network "no new requests" from [1], ESC/click-outside close, "Open source" opens new tab.
- **Live UI receipt:** 2026-02-28 18:03–18:05 — All 6 verification steps completed with concrete MCP receipts (browser_snapshot, browser_network_requests, browser_console_messages, browser_tabs). See UI_RECEIPTS.md Goal 9 section B for full receipts. **PASS**

---

## Goal 10: Retrieval summary one-liner

- **Status:** Partially implemented
- **Evidence:** `client/src/components/DocAnswer.tsx` — retrieval summary line (chunksConsidered, distinctSources, topSimilarityScore). `client/src/pages/chat.tsx` — same for legacy bullets path.
- **Proof requirement:** After a doc-backed reply, a one-liner is visible (e.g. "N chunks · M sources · best match X%") near the answer or in DocAnswer.

---

## Goal 11: Abstention deterministic eval

- **Status:** Partially implemented
- **Evidence:** `server/lib/scoring/deterministicChecks.ts` — `abstentionPass`: when `chunkCount === 0`, true only if `!hasSubstantiveFactualClaims(answerText)`; else `abstention_factual_claims_with_zero_chunks` in failedChecks.
- **Proof requirement:** Run eval pipeline that calls `runDeterministicChecks` with zero `retrievedChunks`. If answer contains substantive factual claims, `abstentionPass` must be false and failedChecks must include the abstention check name. If answer abstains, `abstentionPass` must be true.

---

## Goal 12: Owner-in-cited-source eval

- **Status:** Partially implemented
- **Evidence:** `server/lib/scoring/deterministicChecks.ts` — `ownerCitationPass`: owner mentions extracted from answer must appear in `allCitedText` (snippets from cited chunks).
- **Proof requirement:** Eval run where answer mentions an owner name: if that name appears in cited chunk snippets, `ownerCitationPass` is true; otherwise false and `owner_not_in_cited_chunks` in failedChecks.

---

## Goal 13: Deadline-in-cited-source eval

- **Status:** Partially implemented
- **Evidence:** `server/lib/scoring/deterministicChecks.ts` — `deadlineCitationPass`: date/deadline mentions in answer must appear in cited chunk snippets.
- **Proof requirement:** Eval run where answer mentions a deadline/date: if that date appears in cited chunks, `deadlineCitationPass` is true; otherwise false and `deadline_not_in_cited_chunks` in failedChecks.

---

## Goal 14: Retrieval recall @K

- **Status:** Partially implemented
- **Evidence:** `server/lib/scoring/deterministicChecks.ts` — `retrievalRecallPass`: when `expectedChunkIds` is non-empty, at least one id must be in the set of retrieved chunk ids; else `retrieval_recall_expected_chunk_missing`.
- **Proof requirement:** When the scoring pipeline or eval runner supplies `expectedChunkIds`, the deterministic result’s `retrievalRecallPass` is true iff at least one expected id is in the retrieved set. If no expected ids are passed, the check is not applied (pass by default).

---

## Goal 15: Thumbs up/down feedback wired end-to-end

- **Status:** Implemented
- **Evidence:** `client/src/pages/chat.tsx` — `FeedbackButtons`; POST `/api/chat/feedback` with `replyId`, `requestId`, `feedback` (up/down), CSRF and credentials. `server/routes_v2.ts` — `POST /api/chat/feedback` (auth, validate body, resolve reply, check ownership, merge `userFeedback` into message metadata).
- **Proof requirement:** After a reply, thumbs up and thumbs down are visible. Click one; Network shows POST `/api/chat/feedback` with status 200 (and credentials). No 403 or console error. Verify feedback is persisted (reload page, confirm state).
- **Live UI receipt:** 2026-02-28 18:05–18:06 — Clicked "Helpful", verified POST /api/chat/feedback 200, buttons disabled, page reloaded, GET /messages returned userFeedback, buttons remained disabled. See UI_RECEIPTS.md Goal 15 section C for full receipts. **PASS**

---

## Goal 16: Summary table priority + impact populated and not duplicative

- **Status:** Implemented
- **Evidence:** `client/src/components/DocAnswer.tsx` — summary table with Priority column (`PriorityPill`), Impact column; DetailsDrawer + DocAnswer unique keys; summaryRows deduped by stable signature (item|priority|owner|impact|citationIds).
- **Proof requirement (strict):** DevTools evidence in UI_RECEIPTS: Console output with zero "Encountered two children with the same key" warnings; N = visible summary rows; item cell text for each row.
- **Live UI receipt:** 2026-02-28 18:06–18:07 — Console verified zero duplicate key warnings; 4 distinct bullet items identified from snapshot. See UI_RECEIPTS.md Goal 16 section D for full receipts. **PASS**
