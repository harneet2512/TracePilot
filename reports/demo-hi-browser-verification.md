# Browser Verification Report: Demo "Hi" Flow + Admin Dashboards

Date: 2026-02-15  
Environment: local Windows, Playwright headed run  
Base URL: `http://127.0.0.1:5000`

## Commands executed

1. `npm ls @playwright/test` (not installed initially)
2. `npm i -D @playwright/test`
3. `npx playwright install`
4. `npx playwright test tests/e2e/demo-hi-and-dashboard.spec.ts --headed` (multiple iterative runs)

Latest run result: **FAILED**  
Failure reason: `replyDetailApiJson.retrievalArtifact` is `undefined` in `/api/admin/chats/:chatId/replies/:replyId` payload.

## URLs verified

- Chat UI: `http://127.0.0.1:5000/chat`
- Admin Chats: `http://127.0.0.1:5000/admin/chats`
- Reply Detail: `http://127.0.0.1:5000/admin/chats/:chatId/replies/:replyId`
- Admin Evals: `http://127.0.0.1:5000/admin/evals`

## Auth approach used

Used existing login route (no production auth bypass added):
- `POST /api/auth/login` with `admin@tracepilot.com` / `admin123`

To guarantee local proof DB state for e2e, test helper setup was used:
- `tests/e2e/setup-proof-db.ts`

## PASS / FAIL checklist

- Chat UI loads and accepts "Hi": **PASS**
- Streaming/render behavior visible: **PASS**
- Network API responses observed (200s in network log): **PASS**
- Chat appears in `/admin/chats`: **PASS**
- Reply drilldown opens: **PASS**
- Artifacts present or correctly empty for greeting: **FAIL**
  - `retrievalArtifact` is missing (`undefined`) in reply-detail API payload.
- `/admin/evals` loads and renders: **PASS**

## Artifact paths

Primary run artifacts:
- Trace zip: `test-results/playwright/demo-hi-and-dashboard-demo-b9fea-hats---reply-detail---evals/trace.zip`
- Video: `test-results/playwright/demo-hi-and-dashboard-demo-b9fea-hats---reply-detail---evals/video.webm`
- Screenshot (chat after Hi): `test-results/playwright/demo-hi-and-dashboard-demo-b9fea-hats---reply-detail---evals/01-chat-after-hi.png`
- Screenshot (admin chats list): `test-results/playwright/demo-hi-and-dashboard-demo-b9fea-hats---reply-detail---evals/02-admin-chats-list.png`
- Screenshot (reply detail): `test-results/playwright/demo-hi-and-dashboard-demo-b9fea-hats---reply-detail---evals/03-reply-detail.png`
- Network logging output: `test-results/playwright/demo-hi-and-dashboard-demo-b9fea-hats---reply-detail---evals/network.log`

Retry run artifacts:
- Trace zip: `test-results/playwright/demo-hi-and-dashboard-demo-b9fea-hats---reply-detail---evals-retry1/trace.zip`
- Video: `test-results/playwright/demo-hi-and-dashboard-demo-b9fea-hats---reply-detail---evals-retry1/video.webm`
- Network logging output: `test-results/playwright/demo-hi-and-dashboard-demo-b9fea-hats---reply-detail---evals-retry1/network.log`

## Bugs found

1. **Missing retrieval artifact in reply-detail payload**
   - Severity: **High**
   - Repro:
     1) Send greeting in chat.
     2) Open admin chat list, then chat detail, then reply detail.
     3) Inspect `/api/admin/chats/:chatId/replies/:replyId`.
   - Observed:
     - `replyDetailApiJson.retrievalArtifact` is `undefined`.
   - Expected:
     - Either a populated retrieval artifact or an explicit empty artifact object for greeting/no-retrieval cases.
   - Suspected root cause:
     - Retrieval artifact persistence/read path is not reliably producing an explicit empty artifact row/object for some reply flows.
