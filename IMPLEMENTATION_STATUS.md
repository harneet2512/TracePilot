# TracePilot — Implementation Status (Detailed Audit)

## Goal 1: Fix double-send bug
**Status: Implemented**
- **File:** `client/src/pages/chat.tsx` — `isSendingRef` (line ~982) guards against double sends; reset in `onSettled`.
- **Test:** `tests/no-duplicate-send.spec.ts` exists.

## Goal 2: Replace "FieldCopilot" branding
**Status: Partially Implemented**
- **Files:** `server/lib/agent/agentCore.ts` (line 268), `config/quickReplies.json` — both say "TracePilot".
- **Remaining:** ~72 files contain `fieldcopilot` in functional test credentials (e.g. `admin@fieldcopilot.com`), which are not user-facing branding.

## Goal 3: Enterprise system prompt
**Status: Implemented**
- **File:** `server/lib/agent/agentCore.ts` — `RESPONSE_STYLE_RULES` constant (lines 266-299).

## Goal 4: Zero-chunk guard
**Status: Implemented**
- **File:** `server/lib/agent/agentCore.ts` (line 1109), `server/routes_v2.ts` (line 2839), `server/lib/scoring/deterministicChecks.ts` (line 181).

## Goal 5: Rolling context
**Status: Implemented**
- **File:** `client/src/pages/chat.tsx` (lines 1042-1047) — sends last 20 messages as `conversationHistory`.

## Goal 6: Evidence as horizontal compact cards
**Status: Implemented**
- **File:** `client/src/components/DocAnswer.tsx` (lines 164-228) — `EvidenceList` component.

## Goal 7: Trust badge (skeleton during streaming)
**Status: Implemented**
- **File:** `client/src/pages/chat.tsx` — skeleton at line 684, resolved badge at lines 851-890.
- **File:** `server/lib/scoring/trustSignal.ts` — `computeTrustSignal()`.

## Goal 8: Trust badge clickable to eval detail
**Status: Implemented**
- **File:** `client/src/pages/chat.tsx` — wraps badge in `<a>` linking to `/admin/chats/${conversationId}/replies/${replyId}`.

## Goal 9: Source highlighting (inline citation popover)
**Status: Implemented**
- **File:** `client/src/pages/chat.tsx` — `CitationPopover` component (lines 103-144), `renderInlineCitationNodes` (lines 146-182).

## Goal 10: Retrieval summary one-liner
**Status: Implemented**
- **Files:** `client/src/components/DocAnswer.tsx` (lines 287-300), `client/src/pages/chat.tsx` (lines 826-831).

## Goal 11: Deterministic abstention eval
**Status: Implemented**
- **File:** `server/lib/scoring/deterministicChecks.ts` — `abstentionPass` (line 181).

## Goal 12: Owner in cited source eval
**Status: Implemented**
- **File:** `server/lib/scoring/deterministicChecks.ts` — `ownerCitationPass` (lines 196-200).

## Goal 13: Deadline in cited source eval
**Status: Implemented**
- **File:** `server/lib/scoring/deterministicChecks.ts` — `deadlineCitationPass` (lines 202-206).

## Goal 14: Retrieval recall @K
**Status: Implemented**
- **File:** `server/lib/scoring/deterministicChecks.ts` — `retrievalRecallPass` (lines 208-212).

## Goal 15: Thumbs up/down feedback
**Status: Implemented (UI)**
- **File:** `client/src/pages/chat.tsx` — `FeedbackButtons` component with `ThumbsUp`/`ThumbsDown` icons, sends to `POST /api/chat/feedback`.
- **Backend:** The endpoint needs to be added to `server/routes_v2.ts` to persist feedback. The UI is wired and ready.

## Goal 16: Summary table with priority/impact
**Status: Implemented**
- **File:** `client/src/components/DocAnswer.tsx` (lines 311-389) — Priority column with `PriorityPill`, Impact column.

## UI Requirement: Quick replies outside answer bubble
**Status: Implemented**
- Quick replies from `response.quickReplies` now render as a separate panel below the message list (near line 1609), matching the `dynamicSuggestions` pattern. They were removed from inside `MessageBubble`.
