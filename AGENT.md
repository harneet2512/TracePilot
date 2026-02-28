# TracePilot — AGENT.md (Living Source of Truth)

## Goals Status (1–16)

| # | Goal | Status |
|---|------|--------|
| 1 | Fix double-send bug | ✅ Implemented |
| 2 | Replace "FieldCopilot" branding with "TracePilot" | ⚠️ Partially Implemented (functional test emails remain) |
| 3 | Enterprise system prompt | ✅ Implemented |
| 4 | Zero-chunk guard | ✅ Implemented |
| 5 | Rolling context | ✅ Implemented |
| 6 | Evidence as horizontal compact cards | ✅ Implemented |
| 7 | Trust badge (skeleton → resolved) | ✅ Implemented |
| 8 | Trust badge clickable to eval detail | ✅ Implemented |
| 9 | Source highlighting (inline citation popover) | ✅ Implemented |
| 10 | Retrieval summary one-liner | ✅ Implemented |
| 11 | Deterministic abstention eval | ✅ Implemented |
| 12 | Owner in cited source eval | ✅ Implemented |
| 13 | Deadline in cited source eval | ✅ Implemented |
| 14 | Retrieval recall @K | ✅ Implemented |
| 15 | Thumbs up/down feedback | ✅ Implemented (UI only; backend endpoint pending server-side wiring) |
| 16 | Summary table with priority/impact | ✅ Implemented |
| UI | Quick replies outside answer bubble | ✅ Implemented |

## Commands

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` (port 5000) |
| Unit tests | `npm test` |
| Golden eval | `npm run eval:golden` or `npm run eval` |
| Golden 5-dim | `npm run eval:golden-five` |
| Playwright E2E | `npx playwright test` |
| RAG quality gate | `npm run quality:rag` |
| CI gate | `npm run ci` |

## Key File Map

| Component | Path |
|-----------|------|
| System prompt | `server/lib/agent/agentCore.ts` |
| Quick replies config | `config/quickReplies.json` |
| Streaming route | `server/routes_v2.ts` — `POST /api/chat/stream` |
| Chat UI | `client/src/pages/chat.tsx` |
| Evidence cards | `client/src/components/DocAnswer.tsx` |
| Trust signal | `server/lib/scoring/trustSignal.ts` |
| Deterministic evals | `server/lib/scoring/deterministicChecks.ts` |
| Golden dataset | `eval/golden/cases.ts` (READ-ONLY) |
