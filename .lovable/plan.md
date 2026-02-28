

# TracePilot Phase 1: Discovery, Audit, and Implementation Plan

## Overview

This plan covers the Phase 1 deliverables: creating AGENT.md, updating AGENT_PLAN.md, and creating IMPLEMENTATION_STATUS.md based on thorough codebase discovery. No production code changes are made in this phase.

---

## 1. Codebase Discovery Results (File Map)

| Component | Exact Path(s) |
|-----------|---------------|
| System prompt | `server/lib/agent/agentCore.ts` -- `RESPONSE_STYLE_RULES` (line 266), `buildStreamingSystemPrompt()` (line ~440), NO-MATCH RULE (line ~501) |
| Greeting / quick replies config | `config/quickReplies.json` |
| Quick replies loader | `server/lib/quickReplies.ts` |
| captureReplyArtifacts | `server/lib/scoring/replyScoringPipeline.ts` (definition), `server/routes_v2.ts` (usage) |
| Streaming route handler | `server/routes_v2.ts` -- `POST /api/chat/stream` |
| Chat client page | `client/src/pages/chat.tsx` |
| Evidence/citation rendering | `client/src/components/DocAnswer.tsx`, `client/src/pages/chat.tsx` (CitationPopover, renderInlineCitationNodes) |
| Eval suite (deterministic) | `server/lib/scoring/deterministicChecks.ts` |
| Trust signal module | `server/lib/scoring/trustSignal.ts` |
| LLM judge | `server/lib/scoring/llmJudge.ts` |
| Golden dataset | `eval/golden/cases.ts`, `eval/golden/runner.ts`, `qa/` |
| Agent core (retrieval + LLM) | `server/lib/agent/agentCore.ts` |
| UI quick replies rendering | `client/src/pages/chat.tsx` lines 891-905 (inside message bubble) and lines 1560-1566 (initial suggestions below empty state) |

## 2. Commands

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` (port 5000) |
| Unit tests | `npm test` (runs `server/__tests__/*.test.ts`) |
| Eval offline | `npm run eval:offline` |
| Golden eval | `npm run eval:golden` or `npm run eval` |
| Golden 5-dimension | `npm run eval:golden-five` |
| Playwright E2E | `npx playwright test` |
| RAG quality gate | `npm run quality:rag` |
| CI gate | `npm run ci` |
| Demo seed + verify | `npm run demo:test` |

## 3. Goal-by-Goal Implementation Status

### Goal 1: Fix double-send bug
**Status: Implemented**
- `client/src/pages/chat.tsx` uses `isSendingRef` (line 982) to guard against double sends, and resets it in `onSettled` (line 1308-1310).
- `abortControllerRef` is aborted before new sends (lines 1479-1482).
- A Playwright test exists at `tests/no-duplicate-send.spec.ts`.

### Goal 2: Replace "Field-Copilot" branding with "TracePilot"
**Status: Partially Implemented**
- The system prompt in `agentCore.ts` already says "TracePilot" (line 268).
- `config/quickReplies.json` greeting says "TracePilot".
- However, ~72 files still reference "fieldcopilot" (mostly in test credentials like `admin@fieldcopilot.com` and simulated OAuth emails like `sim-${provider}@test.fieldcopilot.dev`). These are functional identifiers, not user-facing branding, so they may be acceptable as-is.
- Need to verify no user-facing UI text says "FieldCopilot" -- the chat page welcome text and sidebar do not appear to contain it.

### Goal 3: Enterprise system prompt
**Status: Implemented**
- `RESPONSE_STYLE_RULES` constant in `agentCore.ts` (lines 266-299) defines the enterprise prompt with insight-first structure, urgency framing, downstream risk, specific next steps, and the required section order.

### Goal 4: Zero-chunk guard
**Status: Implemented**
- `agentCore.ts` line 1109: "Zero-chunk guard: do not call LLM when no relevant chunks" with abstention message and clarifying questions.
- `routes_v2.ts` line 2839: Zero-chunk abstention for GENERAL path.
- `deterministicChecks.ts` line 181: `abstentionPass` check.

### Goal 5: Rolling context (follow-up questions)
**Status: Implemented**
- `chat.tsx` lines 1042-1047: Client sends `conversationHistory` (last 20 messages) with each request.
- The comment says "server uses last 10 pairs."

### Goal 6: Evidence as horizontal compact cards
**Status: Implemented**
- `DocAnswer.tsx` lines 164-228: `EvidenceList` renders horizontal flex row of 240px cards with excerpt, connector icon, and Open button.

### Goal 7: Trust badge (skeleton during streaming, resolves on final)
**Status: Implemented**
- `chat.tsx` line 684: Skeleton trust badge during streaming (`trust-badge-skeleton`).
- `chat.tsx` lines 851-890: Trust badge renders with grounded/review/warning levels, tooltip, and color coding.
- `trustSignal.ts` exists with `computeTrustSignal()` function.

### Goal 8: Trust badge clickable to eval detail
**Status: Implemented**
- `chat.tsx` lines 870-877: If `replyId` and `conversationId` exist, the badge wraps in an anchor link to `/admin/chats/${conversationId}/replies/${replyId}`.

### Goal 9: Source highlighting (inline citation popover)
**Status: Implemented**
- `chat.tsx` lines 103-144: `CitationPopover` component with title, excerpt, and Open button. Closes on click outside (Radix Popover default). ESC closes via Radix behavior.
- `renderInlineCitationNodes` (lines 146-182) renders `[N]` markers as popover triggers.

### Goal 10: Retrieval summary one-liner
**Status: Implemented**
- `DocAnswer.tsx` lines 287-300: Renders "N chunks . M sources . best match X%" when `retrievalSummary` is present.
- `chat.tsx` lines 826-831: Same for non-structured responses.

### Goal 11: Deterministic abstention eval
**Status: Implemented**
- `deterministicChecks.ts` line 181: `abstentionPass = chunkCount > 0 || !hasSubstantiveFactualClaims(input.answerText)`.

### Goal 12: Owner in cited source eval
**Status: Implemented**
- `deterministicChecks.ts` lines 196-200: `ownerCitationPass` extracts owner mentions and checks they appear in cited chunk snippets.

### Goal 13: Deadline in cited source eval
**Status: Implemented**
- `deterministicChecks.ts` lines 202-206: `deadlineCitationPass` extracts date mentions and checks they appear in cited chunk snippets.

### Goal 14: Retrieval recall @K
**Status: Implemented**
- `deterministicChecks.ts` lines 208-212: `retrievalRecallPass` checks if any `expectedChunkIds` appear in retrieved set.

### Goal 15: Thumbs up/down feedback
**Status: Missing**
- No thumbs up/down UI exists in `chat.tsx` or any component.
- No feedback API endpoint was found.
- No feedback storage schema was found.

### Goal 16: Summary table with priority and impact columns
**Status: Implemented**
- `DocAnswer.tsx` lines 311-389: Table includes Priority column (line 317-319) with `PriorityPill` component, Impact column (lines 320-322), and both display values or "---" fallback (lines 345-349).

### UI Requirement: Quick replies outside answer bubble
**Status: Partially Implemented**
- Quick replies from response data currently render INSIDE the answer bubble (`chat.tsx` lines 891-904).
- Dynamic suggestions render OUTSIDE the message list (lines 1600-1608), which is correct.
- Initial suggestions render in the empty state (lines 1560-1566), which is correct.
- The quick replies from `response.quickReplies` need to be moved out of the `MessageBubble` component to a separate panel below the chat area.

---

## 4. Implementation Plan (Phase 2, after EXECUTE)

### Files to Create
1. **AGENT.md** -- Living source of truth with goals 1-16 status, commands, and execution order.
2. **IMPLEMENTATION_STATUS.md** -- Detailed audit per goal with file paths and evidence.
3. Update **AGENT_PLAN.md** -- Already exists; will be updated to reflect current reality.

### Files to Modify (Phase 2, only after EXECUTE)

#### Group A: Quick Replies UI Fix (Goal partial: quick replies outside bubble)
- **`client/src/pages/chat.tsx`**: Move `response.quickReplies` rendering from inside `MessageBubble` to the message list area below the last assistant message, matching the `dynamicSuggestions` pattern.

#### Group B: Thumbs Up/Down Feedback (Goal 15)
- **`client/src/pages/chat.tsx`**: Add thumbs up/down buttons to the assistant message bubble footer area (next to trust badge).
- **`server/routes_v2.ts`**: Add `POST /api/chat/feedback` endpoint that stores feedback by requestId/replyId.
- **`server/storage.ts`** or schema: May need a feedback column or table. Will check existing schema for a feedback field before creating new storage.
- Wire feedback to the scoring pipeline via `captureReplyArtifacts`.

#### Group C: Branding Audit (Goal 2 partial)
- Verify all user-facing strings. The `admin@fieldcopilot.com` email is a functional credential, not branding, so it does not need to change unless explicitly requested.

### Execution Sequence
1. Create AGENT.md, update AGENT_PLAN.md, create IMPLEMENTATION_STATUS.md.
2. Stop and wait for EXECUTE.
3. After EXECUTE: implement Goal 15 (thumbs feedback) and fix quick replies UI placement.
4. Run health check after each change.
5. Create GROUP1-4_TEST_RESULTS.md files.
6. Run golden eval and create GOLDEN_EVAL_RESULTS.md.

### Technical Details

**Quick Replies Fix**: The `onSendQuickReply` callback and `response.quickReplies` data will be lifted from the `MessageBubble` component. Instead of rendering inside the card, the last assistant message's quick replies will be rendered as a separate row between the message list and the input area, similar to how `dynamicSuggestions` already works at lines 1600-1608.

**Thumbs Feedback**: Will add `ThumbsUp` and `ThumbsDown` icons from lucide-react (already installed). The feedback will be sent via a new API endpoint that associates feedback with the replyId. The endpoint will store feedback in the existing eval/scoring pipeline. No new dependencies are needed.

