# LOVABLE_CHANGES.md

| Timestamp | File | What Changed | Why | Verified By |
|-----------|------|-------------|-----|-------------|
| 2026-02-28T00:01 | package.json | Added `build:dev` script (`vite build`) | Lovable Preview requires this script to build | Build succeeds |
| 2026-02-28T00:02 | client/src/lib/demoMode.ts | Created — central demo mode detection, demoUser, shouldFallbackToDemo, getDemoResponse | Centralized demo logic per plan | Import works, no build errors |
| 2026-02-28T00:02 | client/src/lib/demoResponses.json | Created — 3 mock responses (okr, blocker, default) matching ChatResponse schema | Single-file mock data for UI testing | JSON valid, schema-conformant |
| 2026-02-28T00:03 | client/src/lib/auth.tsx | Added demo fallback in checkAuth() and login() using shouldFallbackToDemo | Auth bypass when backend unreachable + VITE_DEMO_MODE=true | Preview loads past login |
| 2026-02-28T00:03 | client/src/pages/chat.tsx | Added demo fallback import + fallback in mutationFn after all retries | Chat works when /api/chat/stream is unreachable | Demo response renders |
| 2026-02-28T00:03 | client/src/hooks/use-conversations.ts | Added demo fallback in all query functions | Sidebar works when /api/conversations is unreachable | Conversation list renders |
| 2026-02-28T00:04 | VITE_DEMO_MODE secret | Set to "true" via Lovable secrets | Enables demo mode in preview | Secret saved |
