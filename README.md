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

<p align="center">
  <a href="https://github.com/harneet2512/TracePilot/releases/download/v1.0.0/TracePilot-Demo-fixed.mp4">
    <img src="https://img.shields.io/badge/▶_Watch_Demo-TracePilot-blue?style=for-the-badge&logo=github" alt="Watch Demo" />
  </a>
</p>

<!-- To auto-embed the video, open issue #1, drag-drop the mp4, copy the user-attachments URL, and paste it here: -->
<!-- https://github.com/user-attachments/assets/PASTE-VIDEO-ID-HERE -->

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
- **Observability:** Custom tracing + Prometheus metrics

---

## Evaluation System

TracePilot includes a production-grade evaluation pipeline that scores every chat reply across multiple dimensions, runs golden-case regression suites, and blocks CI merges on quality drops.

### Scoring Pipeline

Every chat reply is automatically scored by a multi-layer pipeline:

**Deterministic checks** (no LLM, instant):
| Check | What it validates |
|-------|-------------------|
| `formatValidRate` | Response validates against ChatResponse JSON schema |
| `mustCitePass` | At least 1 citation present when evidence is retrieved |
| `lengthPass` | Response within min/max length bounds |
| `abstentionPass` | Zero retrieved chunks → answer avoids confident claims |
| `ownerCitationPass` | Named owners appear in cited chunks, not hallucinated |
| `deadlineCitationPass` | Dates/deadlines trace back to cited evidence |
| `piiLeakDetected` | Scans for email, API key, AWS key, bearer token patterns |

**Grounding metrics** (hybrid deterministic + LLM judge):
| Metric | Description |
|--------|-------------|
| `groundedClaimRate` | % of claims supported by retrieved evidence |
| `unsupportedClaimRate` | % of claims with no supporting chunk |
| `contradictionRate` | % of claims that contradict evidence |
| `hallucinationCount` | Absolute count of unsupported claims |
| `numericMismatchCount` | Numbers in answer that don't match source values |

**Citation quality metrics:**
| Metric | Description |
|--------|-------------|
| `citationCoverageRate` | Ratio of cited sentences to total sentences |
| `citationIntegrityRate` | Ratio of valid citations (with sourceId + chunkId) to total |
| `citationMisattributionRate` | Claims cited to wrong sources |
| `overCitingRate` | Penalty when citations exceed claim count |
| `multiSourceSupportRate` | Claims backed by 2+ independent sources |

**LLM judge scores** (GPT-4o evaluator):
| Score | Description |
|-------|-------------|
| `answerRelevanceScore` | Does the answer address the user's question? |
| `completenessScore` | Coverage of expected points |
| `contextRelevanceScore` | Was the retrieved context relevant? |
| `contextRecallScore` | Did retrieval surface the right chunks? |
| Per-claim labels | Each claim labeled `entailed`, `unsupported`, or `contradicted` with rationale |

**Trust signal** (UI badge computed from metrics):
- **Grounded** — coverage ≥ 60%, integrity ≥ 80%, no PII, relevance ≥ 40%
- **Review** — middle tier, partial evidence
- **Warning** — coverage < 30%, integrity < 50%, PII detected, or failed must-cite

### Enterprise Eval Pack (14 Components)

A comprehensive eval artifact scored on every reply in production:

| # | Component | Pass Threshold | What it measures |
|---|-----------|----------------|------------------|
| 1 | Evidence Coverage | ≥ 85% | % of claims mapped to supporting chunks |
| 2 | Evidence Sufficiency | ≥ 70% | Per-claim evidence strength |
| 3 | Multihop Trace | ≥ 0.8 | At least 2 unique sources cited |
| 4 | Directness | ≥ 0.75 | Prompt-term overlap in first paragraph |
| 5 | Actionability | — | Presence of action language (recommend, next step) |
| 6 | Clarity | — | Word count 80–500, 3–7 bullets, no repetition |
| 7 | Follow-up Quality | — | ≤ 1 follow-up question |
| 8 | Source Scope | — | Citations within allowed source list |
| 9 | Hallucination Avoidance | — | Low-evidence triggers abstention language |
| 10 | PII Leak | — | No email/API key/AWS key/bearer token in output |
| 11 | Stability | — | Unsupported claim rate variance < 15% |
| 12 | Retrieval Drift | — | Retrieved chunks available for comparison |
| 13 | Citation UI Readiness | ≥ 90% | Citations include URLs for frontend rendering |
| 14 | Debug Panel Completeness | ≥ 85% | Required debug fields present |

**Overall pass** = average score ≥ 0.8 + all safety gates clear.

### Golden Eval Suite

10 curated test cases covering the full retrieval/grounding surface:

| Case | Query | Tests |
|------|-------|-------|
| Q1 | Q4 OKRs | Launch date, latency target, budget extraction |
| Q2 | Blockers | AWS quota, Pinecone cost identification |
| Q3 | Vector DB choice | Pinecone config, pod type, cost grounding |
| Q4 | AWS owner & deadline | Person name + escalation date from Jira |
| Q5 | 2025 roadmap | Q1–Q4 feature extraction across sources |
| Q6 | Infrastructure contact | Email, Slack handle, responsibilities |
| Q7 | Project cost | Allocated vs spent, line-item breakdowns |
| Q8 | Biggest risk | Risk identification, mitigation, fallback plan |
| Q9 | Claude vs GPT-4 | Cost comparison %, citation accuracy delta |
| Q10 | Project overview | Comprehensive multi-source synthesis |

Each case specifies `minSources`, `expectedSourcePrefixes`, and `expectedFacts` with `requiredValues` for exact-match validation (with numeric formatting tolerance).

### CI Regression Gate

The CI gate (`npm run ci`) compares the current eval run against a baseline and fails the build on quality regressions:

| Threshold | Limit | Action |
|-----------|-------|--------|
| Success rate drop | > 3% | **FAIL** — block merge |
| Citation integrity drop | > 2% | **FAIL** — block merge |
| Cost increase without improvement | > 10% | **FAIL** — block merge |

Baseline management supports three comparison modes: `previous` (last run), `pinned` (saved baseline), and `window` (time-windowed average).

---

## Admin Dashboard

TracePilot ships with a full admin dashboard at `/admin/*` covering chat quality, evaluations, observability, audit trail, connector management, and policy configuration.

### Evals Dashboard (`/admin/evals`)

Two modes — **Production** and **Suites**:

**Production mode** shows live quality KPIs across 24h/7d/30d windows:
- Grounding average, citation integrity, hallucination risk rate
- Retrieval hit rate, unique sources average, refusal rate, safety rate
- Latency breakdowns: retrieval P50/P95, generation P50/P95, total P50/P95
- Per-reply production metrics: success rate, unsupported claim rate, tool failure rate
- Enterprise pass rates: overall, citation UI readiness, hallucination avoidance, stability
- Worst replies table (bottom performers by any metric)
- Failure mode breakdown with category rates

**Suites mode** for running and comparing eval suites:
- Upload custom eval suite JSON, launch runs, view pass/fail results
- Baseline comparison with delta metrics and severity (P0/P1/P2)
- Gate status: PASS / WARN / FAIL with issue counts
- Regressed/improved case tables with drilldown links
- 30-point run trend charts for key metrics
- Enterprise eval pack pass rate and average score

### Chat Quality Dashboard (`/admin/chats`)

Aggregate metrics across all conversations:
- Chat count, reply count, success rate
- P95 latency, P95 TTFT (time to first token)
- Average/P95 token usage, total cost
- Unsupported claim rate (avg and P95), citation integrity
- Tool failure rate, enterprise pass rates
- Per-chat rows with model, environment, reply count, cost, and regression flags
- Filters by environment and model

### Chat Detail View (`/admin/chats/:id`)

Deep dive into a single conversation:
- Full message thread with per-reply latency, TTFT, tokens, cost, trace ID
- Retrieval artifacts: chunks/sources count, top similarity
- Citation artifacts: integrity rate, count, coverage
- Eval artifacts: grounded rate, unsupported rate, relevance, completeness
- Low-evidence calibration pass/rationale
- Tool call history with parameters and response summaries
- Aggregate stats: latency/token min/max/avg/P50/P95

### Reply Detail View (`/admin/reply/:id`)

Deepest inspection level for a single assistant reply:
- Retrieved chunks with chunkId, sourceId, title, snippet, similarity score
- Citation list with chunk/source mapping, URLs, coverage rate, repair notes
- Per-claim eval labels: claim text, verdict (entailed/unsupported/contradicted), supporting chunks, rationale
- Tool call timeline: name, params, response, latency, status, retry count, dedup detection
- Span list: name, kind, duration
- Deterministic check results: abstention, owner citation, deadline citation, retrieval recall
- Full enterprise eval breakdown with 14 component scores

### Eval Case Drilldown (`/admin/eval-case/:id`)

Regression analysis for a single eval case:
- Baseline vs current status (pass/fail)
- "Why regressed" reasons list
- Per-metric comparison table: metric name, baseline value, current value, delta, severity, status
- Full explainability artifacts from both runs

### Observability Dashboard (`/admin/observability`)

Four tabs with time-range selector (24h/7d/30d) and connector filter:

| Tab | Metrics |
|-----|---------|
| **Chat** | Total conversations, active users, avg response time, token usage, request count, latency split (retrieval/generation/other), hourly timeseries, top errors |
| **Retrieval** | Total searches, avg latency, recall@5, index size, avg chunks/sources returned, performance timeseries |
| **Citations** | Total citations, integrity rate, avg per chat, click-through rate, quality timeseries |
| **Sync** | Total syncs, success rate, avg duration, docs processed, per-channel status with staleness |

### Audit Trail (`/admin/audit`)

Full request-level audit log:
- Request ID, user email, role, success/failure status
- Filters by kind: chat, action_execute, eval, replay
- Per-event: prompt, answer, retrieval details, citations, latency breakdown, cost, trace ID

### Other Admin Pages

| Page | Path | Purpose |
|------|------|---------|
| **Connectors** | `/admin/connectors` | Manage Google Drive, Jira, Confluence, Slack accounts and sync scopes |
| **Ingest** | `/admin/ingest` | Drag-drop file upload with progress, source list with delete |
| **Policies** | `/admin/policies` | YAML policy editor for role-based tool permissions and approval gates |

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

- **Source Versioning:** Immutable snapshots with content-hash dedup. Citations reference `sourceVersionId` + character offsets.
- **Job Runner:** `FOR UPDATE SKIP LOCKED` concurrency, per-connector rate limiting, exponential backoff retries, dead letter queue.
- **Scoring Pipeline:** Every reply passes through deterministic checks → grounding analysis → LLM judge → enterprise eval pack → trust signal computation.
- **Observability:** Request → trace → spans. Prometheus histograms for TTFT, retrieval latency, chunks returned, token counts, grounding rates.

---

## Testing

```bash
npm test                   # Unit tests
npm run test:voice-smoke   # Voice WebSocket smoke test
npm run test:mcp-smoke     # MCP server smoke test
npm run test:rag           # RAG invariant tests (Playwright)
npm run eval               # Golden eval suite (10 cases)
npm run ci                 # CI regression gate
```

---

## License

MIT
