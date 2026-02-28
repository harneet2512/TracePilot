
# TracePilot: Revised Lovable Preview Plan (v3)

## Decision Rules

### Demo Mode Activation

Demo Mode is a fallback, not a bypass:

1. The app ALWAYS attempts real backend calls first (`GET /api/auth/me`, `POST /api/chat/stream`, `GET /api/conversations`).
2. Only when a call fails with status `null` (network failure), `404`, or `405` AND `VITE_DEMO_MODE=true` does the fallback activate.
3. If `VITE_DEMO_MODE` is not set or is `"false"`, failures behave normally (show login error, etc.).
4. All fallback decisions are logged with `[DEMO_MODE]` prefix including status/error detail.

---

## Phase 1: Fix Build Blocker

**Change:** Add one script to `package.json`:
```json
"build:dev": "vite build"
```
No other scripts changed.

**Verification:** Lovable build succeeds; preview renders something (even if login screen).

---

## Phase 2: Backend Capability Probe

1. Open Lovable Preview after build succeeds.
2. Screenshot rendered page, console, and network tab for `GET /api/auth/me`.
3. Document whether backend responds or returns network error / 404.
4. Only proceed to Phase 3 if backend is proven unavailable via receipts.

---

## Phase 3: Demo Mode Implementation

### New File: `client/src/lib/demoMode.ts`

Exports:
- `isDemoMode: boolean` -- `import.meta.env.VITE_DEMO_MODE === "true"`
- `demoUser` -- Conforms to the repo's `User` type (`typeof users.$inferSelect` from `shared/schema.ts`). Required fields from the `users` table (lines 19-28 of shared/schema.ts):

| Field | Type | Demo Value |
|-------|------|------------|
| `id` | `string` (varchar 36) | `"demo-00000000-0000-0000-0000-000000000001"` |
| `workspaceId` | `string` (varchar 36, required) | `"demo-ws-00000000-0000-0000-0000-000000000001"` |
| `email` | `string` (required, unique) | `"demo@tracepilot.dev"` |
| `passwordHash` | `string \| null` | `null` |
| `role` | `"admin" \| "member"` | `"admin"` |
| `createdAt` | `Date` | `new Date()` |

No arbitrary numeric IDs. All string UUIDs matching the varchar(36) column type.

- `logDemoMode(event: string, detail: Record<string, unknown>): void` -- logs `[DEMO_MODE] {event}` with detail
- `shouldFallbackToDemo(status: number | null, error?: unknown): boolean` -- returns `true` only when `isDemoMode && (status === null || status === 404 || status === 405)`
- `getDemoResponse(query: string): FinalEventPayload` -- keyword-matches query against demoResponses.json

### New File: `client/src/lib/demoResponses.json`

Contains 3 mock responses. Each conforms to the **confirmed final event payload** shape from `server/routes_v2.ts` lines 3333-3366. Required and optional fields:

**Required fields (from chatResponseSchema + final event):**

| Field | Type | Notes |
|-------|------|-------|
| `answer` | `string` | Markdown with `[1]` `[2]` markers |
| `answer_text` | `string` | Plain text version |
| `bullets` | `Array<{ claim: string, citations: Citation[] }>` | Can be `[]` |
| `action` | `ActionSchema \| null` | Set to `null` |
| `needsClarification` | `boolean` | Set to `false` |
| `clarifyingQuestions` | `string[]` | Set to `[]` |
| `conversationId` | `string` | UUID |

**Optional fields exercised in demo responses:**

| Field | Type | Notes |
|-------|------|-------|
| `sources` | `Citation[]` (extended with title, snippet, score, sourceType, locationUrl, externalId, mimeType) | Array of source objects |
| `sources_used` | `Citation[]` (same extended shape) | Subset actually cited |
| `citations` | `Citation[]` (extended) | Top-level citations |
| `sections` | `Array<{ title, items[] }>` | Items: `{ text, kind: "objective"\|"kr"\|"bullet", owner?, target?, current?, due?, status?, citations? }` |
| `details` | `{ summaryRows: SummaryRow[], evidenceBySource: EvidenceSource[] }` | summaryRows: `{ item, priority, owner, impact, citationIds }`, evidenceBySource: `{ sourceKey, title, label, url, excerpts }` |
| `trustSignal` | `{ level: string, label: string, detail?: string }` | "grounded", "review", or "warning" |
| `retrievalSummary` | `{ chunksConsidered, distinctSources, topSimilarityScore, fallbackRetrievalUsed }` | Numeric metrics |
| `quickReplies` | `Array<{ label, text }>` | Suggested prompts |
| `replyId` | `string` | For trust badge linking |
| `traceId` | `string \| null` | |
| `framingContext` | `string` | Contextual framing |
| `summary` | `string` | Executive summary |
| `citationIndexMap` | `Record<string, number>` | Source-to-index mapping |

**Base Citation shape** (from citationSchema, lines 996-1010):
```text
{ sourceId, chunkId, sourceVersionId?, charStart?, charEnd?, url?, label?, title?, snippet?, score?, sourceType?, externalId?, mimeType? }
```

**3 mock entries:**
1. **"okr"** -- sections with priority/owner/due, evidence cards, inline citations, trustSignal `grounded`, retrievalSummary, details with summaryRows + evidenceBySource, quickReplies
2. **"blocker"** -- warning trust signal, deadline citations, different sources, details with summaryRows
3. **"default"** -- general answer, review trust signal, retrieval summary

### Modifications to existing files

**`client/src/lib/auth.tsx`** (2 touch points, both use centralized helpers):

In `checkAuth()`: After existing fetch fails, add:
```
if (shouldFallbackToDemo(status, error)) {
  logDemoMode("AUTH_FALLBACK", { status, error: String(error) });
  setUser(demoUser);
}
```
The fetch is ALWAYS attempted first. Fallback only on failure.

In `login()`: In catch block:
```
if (shouldFallbackToDemo(null, error)) {
  logDemoMode("LOGIN_FALLBACK", { error: String(error) });
  setUser(demoUser);
  return;
}
```

**`client/src/pages/chat.tsx`** (1 touch point):

In the streaming fetch error handler: if `shouldFallbackToDemo(null, error)`, call `getDemoResponse(input)` and render it as the final message.

**`client/src/hooks/use-conversations.ts`** (1 touch point):

If `GET /api/conversations` fails and `shouldFallbackToDemo`, return a mock conversation array.

### Quick Replies UI

Quick replies render OUTSIDE the answer bubble (already moved in prior session). Will be verified via screenshot.

---

## Phase 4: Verify in Lovable Preview

| Check | Receipt |
|-------|---------|
| Chat page loads past login | Screenshot |
| No red console errors (demo warnings OK) | Console screenshot |
| `/api/auth/me` fails, demo mode activates | Network + console screenshot |
| Demo response renders with answer text | Screenshot |
| Evidence cards horizontal with excerpt + Open | Screenshot |
| Trust badge visible | Screenshot |
| Inline citations `[1]` render | Screenshot |
| Retrieval summary one-liner | Screenshot |
| Quick replies OUTSIDE answer bubble | Screenshot |
| Thumbs up/down buttons visible | Screenshot |
| Summary table with Priority + Impact | Screenshot |

---

## Phase 5: Documentation

### Create: `LOVABLE_CHANGES.md`

Every change gets a structured entry:
```text
| Timestamp | File | What Changed | Why | Verified By |
```

### Update: `AGENT.md`

- Lovable Preview capabilities (proven by receipts)
- Demo Mode documentation (enable with `VITE_DEMO_MODE=true`)
- Per-goal PASS/FAIL based on live verification

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Edit +1 line | Add `build:dev` |
| `client/src/lib/demoMode.ts` | Create ~50 lines | Central demo logic |
| `client/src/lib/demoResponses.json` | Create ~150 lines | Mock data (single file) |
| `client/src/lib/auth.tsx` | Edit +~12 lines | Auth fallback guard |
| `client/src/pages/chat.tsx` | Edit +~12 lines | Chat fallback guard |
| `client/src/hooks/use-conversations.ts` | Edit +~8 lines | Conversations fallback |
| `LOVABLE_CHANGES.md` | Create | Change log |
| `AGENT.md` | Update | Living source of truth |

## Stop Condition

Respond with exactly **EXECUTE** to begin implementation.
