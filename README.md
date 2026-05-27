# TracePilot

<p align="center">
  <strong>Enterprise knowledge search with grounded AI answers</strong><br />
  Semantic retrieval · grounded citations · connector sync · evaluation visibility · voice agent
</p>

<p align="center">
  <a href="#demo">Demo</a> · <a href="#features">Features</a> · <a href="#evaluation-system">Evals</a> · <a href="#admin-dashboard">Dashboard</a> · <a href="#setup">Setup</a> · <a href="#api">API</a> · <a href="#architecture">Architecture</a>
</p>

---

## Demo

https://github.com/user-attachments/assets/c3e48ddf-ad25-4b43-8a10-9307ea72431a

---

## Features

| Feature | Description |
|---------|-------------|
| **RAG Chat** | Semantic retrieval over ingested documents with grounded, cited answers via SSE streaming |
| **Connector Sync** | Pull from Confluence, Jira, Slack, Google Drive — chunked, embedded, and version-tracked |
| **Voice Agent** | Real-time WebSocket voice interface with EOU detection, barge-in (<250ms), and fast-path intents |
| **MCP Server** | Model Context Protocol server for Claude Desktop and MCP-compatible hosts |
| **Playbooks** | Auto-generated incident response playbooks with SOP steps, PPE checklists, and action drafts |
| **Evaluation Suite** | 14-component enterprise eval pack with golden cases, CI regression gates, and LLM judge scoring |
| **Admin Dashboard** | 10 admin views covering chat quality, evals, observability, audit trail, connectors, and policies |
| **Observability** | Traces, spans, Prometheus histograms, latency breakdowns, token usage tracking |
| **Policy Engine** | YAML-based approval policies for tool actions (Jira tickets, Slack messages) |

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL (Drizzle ORM) or SQLite for local dev
- **AI:** OpenAI GPT-4o + text-embedding-3-small
- **Realtime:** WebSocket (voice), Server-Sent Events (chat streaming)
- **Observability:** Custom span tracing + Prometheus metrics (`/metrics`)

---

## Evaluation System

Every chat reply passes through a multi-layer scoring pipeline. The pipeline runs automatically on each response — no manual trigger needed.

### Reply Scoring Pipeline

```
User query → Retrieval → LLM response
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
          Deterministic Checks       LLM Judge (GPT-4o)
           (instant, no LLM)         (claim-level eval)
                    │                       │
                    └───────────┬───────────┘
                                ▼
                    Enterprise Eval Pack (14 components)
                                │
                                ▼
                    Trust Signal → UI badge
```

### Deterministic Checks

Computed instantly on every reply (`server/lib/scoring/deterministicChecks.ts`):

| Field | Type | What it checks |
|-------|------|----------------|
| `formatValidRate` | `0 \| 1` | Response validates against `chatResponseSchema` (Zod) |
| `citationCoverageRate` | `0–1` | `citationCount / sentenceCount` |
| `citationIntegrityRate` | `0–1` | Citations with valid `sourceId` + `chunkId` / total citations |
| `citationMisattributionRate` | `0–1` | `1 - citationIntegrityRate` |
| `retrievalRelevanceProxy` | `0–1` | Hybrid: lexical term overlap × 0.6 + vector similarity × 0.4 |
| `overCitingRate` | `0–1` | Penalizes when `citationCount > sentenceCount` (>50% triggers flag) |
| `piiLeakDetected` | `bool` | Regex scan for email, phone, `sk-*` API keys, `AKIA*` AWS keys, `Bearer` tokens |
| `mustCitePass` | `bool` | At least 1 citation when `mustCite=true` |
| `lengthPass` | `bool` | Answer length between `minLength` (30) and `maxLength` (6000) chars |
| `abstentionPass` | `bool` | Zero retrieved chunks → answer must not contain owner/deadline factual claims |
| `ownerCitationPass` | `bool` | Owner names extracted from answer must appear in cited chunk text |
| `deadlineCitationPass` | `bool` | Dates extracted from answer must appear in cited chunk text |
| `retrievalRecallPass` | `bool` | At least one `expectedChunkId` found in retrieved set |
| `failedChecks` | `string[]` | Array of all check names that failed |

### LLM Judge

GPT-4o evaluates claim-level grounding (`server/lib/scoring/llmJudge.ts`):

| Field | Type | What it scores |
|-------|------|----------------|
| `claims` | `string[]` | Atomic claims extracted from the answer |
| `claimLabels` | `JudgeClaimLabel[]` | Per-claim: `{ claim, label, supportingChunkIds, rationale }` |
| `groundedClaimRate` | `0–1` | `entailed / totalClaims` |
| `unsupportedClaimRate` | `0–1` | `unsupported / totalClaims` |
| `contradictionRate` | `0–1` | `contradicted / totalClaims` |
| `answerRelevanceScore` | `0–1` | Does the answer address the user's question? |
| `contextRelevanceScore` | `0–1` | Was the retrieved context relevant to the query? |
| `contextRecallScore` | `0–1` | Did retrieval surface the right chunks? |
| `completenessScore` | `0–1` | Coverage of expected points |
| `lowEvidenceCalibration` | `{ pass, rationale }` | Did the answer abstain/clarify when evidence was weak? |
| `judgeModel` | `string` | `"gpt-4o-mini"` |

Each claim label is one of: **`entailed`** (supported by evidence), **`unsupported`** (no matching chunk), **`contradicted`** (conflicts with evidence).

### Golden Eval Scorer

Offline groundedness scoring without LLM (`eval/golden/scorer.ts`):

| Field | Type | Description |
|-------|------|-------------|
| `groundedClaimRate` | `0–1` | Claims with ≥30% word overlap + numeric match against chunk text |
| `hallucinationCount` | `int` | Claims that failed grounding check |
| `numericMismatchCount` | `int` | Claims where `$`, date, or name values don't match source |
| `citationCoverageRate` | `0–1` | Cited claims / total claims |
| `multiSourceSupportRate` | `0–1` | Claims backed by chunks from ≥2 different `sourceId`s |
| `expectedFactsFound` | `int` | `requiredValues` matched in answer (with number formatting tolerance) |
| `expectedFactsMissing` | `string[]` | Facts not found |
| `passed` | `bool` | `true` when `groundedClaimRate ≥ 95%`, zero hallucinations, zero numeric mismatches, all expected facts present, minimum sources met |

### Enterprise Eval Pack (14 Components)

Scored on every reply in production (`server/lib/scoring/enterpriseEvalPack.ts`):

| # | Component | Field | Pass | How it's computed |
|---|-----------|-------|------|-------------------|
| 1 | Evidence Coverage | `evidenceCoverageScore` | ≥ 0.85 | `claimsWithSupportingChunks / totalClaims` |
| 2 | Evidence Sufficiency | `evidenceSufficiencyScore` | ≥ 0.70 | Avg per-claim `min(1, supportCount / 2)` |
| 3 | Multihop Trace | `multihopTraceScore` | ≥ 0.80 | `uniqueSources ≥ 2 → 1.0`, `= 1 → 0.6`, `= 0 → 0.2` |
| 4 | Directness | `directnessScore` | ≥ 0.75 | Prompt-term overlap in first paragraph |
| 5 | Actionability | `actionabilityScore` | ≥ 0.70 | Regex for `next step\|recommend\|should\|plan` |
| 6 | Clarity | `clarityScore` | ≥ 0.70 | Word count 80–500, 3–7 bullets, no 6+ char repetition |
| 7 | Follow-up Quality | `followupQualityScore` | ≥ 0.80 | `questionMarkCount ≤ 1 → 0.9`, else `0.5` |
| 8 | Source Scope | `sourceScopeScore` | `1` | All `citation.sourceId` in `allowedSourceIds` |
| 9 | Hallucination Avoidance | `missingDataHallucinationScore` | `1` | Low-evidence → answer contains abstention language |
| 10 | PII Leak | `piiLeakScore` | `1` | No `email\|sk-*\|AKIA*\|Bearer` patterns in output |
| 11 | Stability | `stabilityVariance` | < 0.15 | `unsupportedClaimRate` proxy variance |
| 12 | Retrieval Drift | `retrievalDriftScore` | ≥ 0.80 | Retrieved chunks present for baseline comparison |
| 13 | Citation UI Readiness | `citationUiReadinessScore` | ≥ 0.90 | `citationsWithUrl / totalCitations` |
| 14 | Debug Panel | `debugPanelCompletenessScore` | ≥ 0.85 | 4 required fields: `retrievedChunksJson`, `retrievalLatencyMs`, `toolCallsJson`, `judgeRationalesJson` |

**`overallScore`** = average of 14 component scores.
**`overallPass`** = `overallScore ≥ 0.8` AND `piiLeakPass` AND `sourceScopePass` AND `missingDataHallucinationPass`.

### Trust Signal

Computed from deterministic checks, drives the UI badge (`server/lib/scoring/trustSignal.ts`):

| Level | Badge | Conditions |
|-------|-------|------------|
| `grounded` | "answer is supported by cited sources" | `citationCoverageRate ≥ 0.6` AND `citationIntegrityRate ≥ 0.8` AND `formatValidRate = 1` AND `!piiLeakDetected` AND `retrievalRelevanceProxy ≥ 0.4` AND `failedChecks.length = 0` |
| `review` | "some claims may need checking" | Everything else |
| `warning` | "source support limited, verify details" | `citationCoverageRate < 0.3` OR `citationIntegrityRate < 0.5` OR `piiLeakDetected` OR `retrievalRelevanceProxy < 0.35` OR `!mustCitePass` |

### Golden Eval Suite (10 Cases)

| Case | Query | `minSources` | `expectedSourcePrefixes` | Key `requiredValues` |
|------|-------|-------------|--------------------------|----------------------|
| Q1 | Q4 OKRs | 1 | `Q4_2024_OKRs` | launch date, latency target, budget |
| Q2 | Blockers | 1 | `JIRA_INFRA` | AWS quota limit, Pinecone cost |
| Q3 | Vector DB choice | 2 | `AI_Search`, `Q4_2024_OKRs` | Pinecone, pod config, cost |
| Q4 | AWS owner & deadline | 1 | `JIRA_INFRA` | Jordan Martinez, escalation date |
| Q5 | 2025 roadmap | 1 | `Product_Roadmap` | Q1–Q4 feature names |
| Q6 | Infra contact | 1 | `Team_Quick_Reference` | email, Slack handle |
| Q7 | Project cost | 2 | `Q4_2024_OKRs`, `Product_Roadmap` | allocated $, spent $ |
| Q8 | Biggest risk | 2 | `JIRA_INFRA`, `Q4_2024_OKRs` | risk name, mitigation |
| Q9 | Claude vs GPT-4 | 2 | `AI_Search`, `Q4_2024_OKRs` | cost %, accuracy delta |
| Q10 | Project overview | 3 | `Q4_2024_OKRs`, `Product_Roadmap`, `AI_Search` | multi-source synthesis |

### CI Regression Gate

`npm run ci` runs `scripts/ciGate.ts` — compares current eval run against baseline:

| Metric | Field | Threshold | Action |
|--------|-------|-----------|--------|
| Success rate | `successRate` | drop > 3% | **FAIL** — block merge |
| Citation integrity | `citationIntegrity` | drop > 2% | **FAIL** — block merge |
| Cost per success | `costPerSuccess` | increase > 10% (without success improvement) | **FAIL** — block merge |
| Recall@5 | `recallAtK` | tracked, no hard gate | **WARN** |

First run becomes baseline (`isBaseline: true`). Comparison modes: `previous`, `pinned`, `window`.

---

## Admin Dashboard

Full admin console at `/admin/*` with 10 views.

### Evals Dashboard (`/admin/evals`)

**Production mode** — live quality KPIs across 24h / 7d / 30d:

| KPI | Field | Source |
|-----|-------|--------|
| Grounding average | `groundingAvg` | Reply eval artifacts |
| Citation integrity | `citationIntegrityRate` | Citation artifacts |
| Hallucination risk | `hallucinationRiskRate` | LLM judge |
| Retrieval hit rate | `retrievalHitRate` | Retrieval artifacts |
| Unique sources avg | `uniqueSourcesAvg` | Retrieval artifacts |
| Refusal rate | `refusalRate` | Deterministic checks |
| Safety rate | `safetyRate` | PII + abstention checks |
| Retrieval P50/P95 | `retrievalP50`, `retrievalP95` | Span latency |
| Generation P50/P95 | `generationP50`, `generationP95` | Span latency |
| Total P50/P95 | `totalP50`, `totalP95` | End-to-end latency |
| Success rate | `successRate` | Reply status |
| Unsupported claim rate | `avgUnsupportedClaimRate` | LLM judge |
| Tool failure rate | `toolFailureRate` | Tool artifacts |
| Enterprise overall pass | `overallPassRate` | Enterprise eval pack |
| Citation UI readiness | `citationUiReadinessRate` | Enterprise eval pack |
| Hallucination avoidance | `hallucinationAvoidanceRate` | Enterprise eval pack |
| Stability pass rate | `stabilityPassRate` | Enterprise eval pack |

Plus: **worst replies** table, **failure mode breakdown** with category rates.

**Suites mode** — run and compare eval suites:
- Upload custom suite JSON, launch runs, view pass/fail per case
- Baseline comparison with delta metrics and severity (P0/P1/P2)
- Gate status: PASS / WARN / FAIL
- Regressed/improved case tables with drilldown links
- 30-point run trend charts

### Chat Quality (`/admin/chats`)

| Column | Description |
|--------|-------------|
| Chat count, reply count | Volume |
| `successRate` | Replies with `status: "ok"` |
| P95 latency, P95 TTFT | `latencyMs`, `ttftMs` percentiles |
| Avg/P95 tokens | `tokensIn + tokensOut` |
| Total cost | `costUsd` sum |
| `avgUnsupportedClaimRate` | From eval artifacts |
| `citationIntegrityRate` | From citation artifacts |
| `toolFailureRate` | Tool artifacts with errors |
| Enterprise pass rates | From enterprise eval pack |

Per-chat rows with model, environment, reply count, cost, regression flags. Filters by environment and model.

### Chat Detail (`/admin/chats/:id`)

Full conversation thread. Per reply:
- `latencyMs`, `ttftMs`, `tokensIn`, `tokensOut`, `costUsd`, `traceId`, `status`
- Retrieval: `chunksReturnedCount`, `sourcesReturnedCount`, `topSimilarity`, `retrievalLatencyMs`
- Citations: `citationIntegrityRate`, `citationCoverageRate`, `citationCount`
- Eval: `groundedClaimRate`, `unsupportedClaimRate`, `answerRelevanceScore`, `completenessScore`
- `lowEvidenceCalibration: { pass, rationale }`
- Tool calls JSON with params and response summaries
- Aggregates: min/max/avg/P50/P95 across all replies

### Reply Detail (`/admin/reply/:id`)

Deepest drill-down for a single assistant reply:

| Artifact | Fields shown |
|----------|-------------|
| **Retrieval** | `chunkId`, `sourceId`, `title`, `snippet`, `score` per chunk; `chunksReturnedCount`, `sourcesReturnedCount`, `topSimilarity`, `retrievalLatencyMs` |
| **Citations** | Per-citation: `sourceId`, `chunkId`, `url`; rates: `citationCoverageRate`, `citationIntegrityRate`, `citationMisattributionRate`; `repairApplied`, `repairNotesJson` |
| **Eval** | Per-claim: `{ claim, label, supportingChunkIds, rationale }`; `groundedClaimRate`, `unsupportedClaimRate`, `contradictionRate`, `answerRelevanceScore`, `contextRelevanceScore`, `completenessScore` |
| **Tools** | Per-call: `name`, `params`, `response`, `latencyMs`, `status`; `retryCount`, `idempotencyKey`, `duplicateActionDetected` |
| **Enterprise** | All 14 component scores + `overallScore` + `overallPass` |
| **Deterministic** | `abstentionPass`, `ownerCitationPass`, `deadlineCitationPass`, `retrievalRecallPass`, `failedChecks[]` |
| **Spans** | `name`, `kind`, `durationMs` per span |

### Eval Case Drilldown (`/admin/eval-case/:id`)

Regression analysis: baseline vs current `pass/fail`, "why regressed" reasons, per-metric comparison (name, baseline value, current value, delta, severity P0/P1/P2, status).

### Observability (`/admin/observability`)

Four tabs with time-range selector (24h/7d/30d) and connector filter:

| Tab | Metrics |
|-----|---------|
| **Chat** | `totalConversations`, `activeUsers`, `avgResponseTime`, `tokenUsage`, `requestCount`, `successRate`, `p95DurationMs`, `avgTokensPerChat`; `latencySplit: { retrievalMs, generationMs, otherMs }`; hourly timeseries; top errors |
| **Retrieval** | `totalSearches`, `avgLatency`, `recallAt5`, `indexSize`, `avgChunksRetrieved`, `avgTopSimilarity`; performance timeseries |
| **Citations** | `totalCitations`, `integrityRate`, `avgCitationsPerChat`, `clickThroughRate`; quality timeseries |
| **Sync** | `totalSyncs`, `successRate`, `avgDuration`, `docsProcessed`; per-channel: `lastSync`, `stalenessMs` |

### Audit Trail (`/admin/audit`)

Request-level audit log. Filters: `chat`, `action_execute`, `eval`, `replay`. Per event: request ID, user email, role, prompt, answer, retrieval details, citations, latency breakdown, `costUsd`, `traceId`.

### Other Admin Pages

| Page | Path | Purpose |
|------|------|---------|
| **Connectors** | `/admin/connectors` | Manage Google Drive, Jira, Confluence, Slack accounts and sync scopes |
| **Ingest** | `/admin/ingest` | Drag-drop file upload with progress, source list with delete |
| **Policies** | `/admin/policies` | YAML policy editor for role-based tool permissions and approval gates |

---

## Prometheus Metrics

Exposed at `GET /metrics` (`server/lib/observability/prometheus.ts`):

| Metric | Type | Labels | Buckets |
|--------|------|--------|---------|
| `chat_ttft_seconds` | Histogram | — | 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10 |
| `chat_total_duration_seconds` | Histogram | — | 0.5, 1, 2, 3, 5, 10, 15, 30, 60 |
| `rag_retrieval_duration_seconds` | Histogram | — | 0.05, 0.1, 0.25, 0.5, 0.75, 1, 2, 5 |
| `rag_chunks_returned` | Histogram | — | 0, 1, 2, 3, 5, 8, 10, 15, 20, 30 |
| `rag_sources_returned` | Histogram | — | 0, 1, 2, 3, 4, 5, 6, 8, 10 |
| `rag_top_similarity` | Histogram | — | 0.3–0.95 (11 buckets) |
| `rag_dedup_sources_saved` | Histogram | — | 0, 1, 2, 3, 5, 10 |
| `llm_duration_seconds` | Histogram | — | 0.5, 1, 2, 3, 5, 10, 15, 30 |
| `llm_tokens_input_total` | Counter | — | — |
| `llm_tokens_output_total` | Counter | — | — |
| `http_requests_total` | Counter | `route`, `method`, `status` | — |
| `http_request_duration_seconds` | Histogram | `route`, `method`, `status` | 0.01–10 (10 buckets) |
| `errors_total` | Counter | `type` | — |
| `grounding_rate` | Histogram | — | 0, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0 |

---

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (or use SQLite for local dev)
- OpenAI API key

### Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env: set DATABASE_URL and OPENAI_API_KEY

# 3. Push schema
npm run db:push

# 4. Start
npm run dev          # server on http://localhost:5000
npm run worker       # async job runner (separate terminal)

# 5. Seed initial data
curl -X POST http://localhost:5000/api/seed
```

### SQLite (no Postgres required)

```bash
npm run db:push:sqlite
npm run dev
```

### Docker Postgres

```bash
docker compose up -d
# DATABASE_URL=postgresql://postgres:postgres@localhost:5433/tracepilot_test
npm run db:push
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (omit for SQLite) |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `GOOGLE_CLIENT_ID` / `SECRET` | No | Google Drive connector |
| `ATLASSIAN_CLIENT_ID` / `SECRET` | No | Jira / Confluence connector |
| `SLACK_CLIENT_ID` / `SECRET` | No | Slack connector |

---

## API

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |

### Chat & Retrieval
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Chat with RAG retrieval (SSE stream) |
| POST | `/api/actions/execute` | Execute tool action |

### Ingestion
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ingest` | Upload files (queued as async jobs) |
| GET | `/api/jobs/:id` | Job status |

### Playbooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/playbooks` | Create from incident text |
| GET | `/api/playbooks` | List playbooks |
| GET | `/api/playbooks/:id` | Playbook detail |

### Evaluation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/eval-suites` | List eval suites |
| POST | `/api/eval-suites/:id/run` | Run eval suite |
| GET | `/api/eval-runs/:id` | Eval run results |

### Observability
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/observability/chat` | Chat metrics + timeseries |
| GET | `/api/admin/observability/retrieval` | Retrieval metrics + timeseries |
| GET | `/api/admin/observability/citations` | Citation metrics + timeseries |
| GET | `/api/admin/observability/sync` | Sync status + per-channel staleness |
| GET | `/api/admin/traces` | Trace and span data |
| GET | `/metrics` | Prometheus scrape endpoint |

### Voice (WebSocket)

Connect to `ws://localhost:5000/ws/voice` — send `voice.session.start`, `voice.transcript`, `voice.endTurn` messages.

### MCP (stdio)

```bash
npm run mcp
```

Tools: `tracepilot.chat`, `tracepilot.playbook`, `tracepilot.action_draft`, `tracepilot.action_execute`
Resources: `tracepilot://status`, `tracepilot://evals`

---

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│  React SPA  │───▶│  Express API │───▶│  PostgreSQL /    │
│  shadcn/ui  │    │  + WebSocket │    │  SQLite + Drizzle│
└─────────────┘    └──────┬───────┘    └─────────────────┘
                          │
                   ┌──────┴───────┐
                   │  Job Runner  │
                   │  (worker)    │
                   └──────┬───────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐
        │ Chunker  │ │ OpenAI │ │ Connector│
        │ + Embed  │ │ GPT-4o │ │ Sync     │
        └──────────┘ └────────┘ └──────────┘
```

### Key Subsystems

- **Source Versioning:** Immutable snapshots with content-hash dedup. Citations reference `sourceVersionId` + `charStart`/`charEnd` offsets.
- **Job Runner:** `FOR UPDATE SKIP LOCKED` concurrency, per-`connectorType` + per-`connectorAccountId` limits, token bucket rate limiting, exponential backoff retries, dead letter queue after `maxAttempts`.
- **Scoring Pipeline:** `captureReplyArtifacts()` → deterministic checks → trust signal → retrieval/citation/tool artifacts → async `scoreReplyWithJudge()` → LLM judge → enterprise eval pack.
- **Observability:** Request → `trace` → `span[]`. Each span: `name`, `kind` (`embed|retrieve|llm|tool|chunk|validate`), `durationMs`, `inputTokens`, `outputTokens`, `similarityMin/Max/Avg`.

---

## Testing

```bash
npm test                   # Unit tests (server/__tests__/*.test.ts)
npm run test:voice-smoke   # Voice WebSocket smoke test
npm run test:mcp-smoke     # MCP server smoke test
npm run test:rag           # RAG invariant tests (Playwright)
npm run eval               # Golden eval suite (10 cases, offline scorer)
npm run ci                 # CI regression gate (fails on threshold breach)
```

---

## License

MIT
