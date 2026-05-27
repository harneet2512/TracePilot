# TracePilot

<p align="center">
  <img src="./docs/media/tracepilot-main.gif" alt="TracePilot demo" width="100%" />
</p>

<p align="center">
  <strong>Enterprise knowledge search with grounded AI answers</strong><br />
  Semantic retrieval · grounded citations · connector coverage · evaluation visibility
</p>

<p align="center">
  <a href="#demo">Demo</a> · <a href="#features">Features</a> · <a href="#setup">Setup</a> · <a href="#api">API</a> · <a href="#architecture">Architecture</a>
</p>

---

## Demo

https://github.com/user-attachments/assets/TracePilot-Demo-fixed.mp4

> Upload the demo video as a GitHub release asset or drag it into a GitHub issue/PR to get the embed URL, then replace the link above.

---

## Features

| Feature | Description |
|---------|-------------|
| **RAG Chat** | Semantic retrieval over ingested documents with grounded, cited answers |
| **Connector Sync** | Pull from Confluence, Jira, Slack, Google Drive — all chunked, embedded, and versioned |
| **Voice Agent** | Real-time WebSocket voice interface with EOU detection, barge-in, and fast-path intents |
| **MCP Server** | Model Context Protocol server for Claude Desktop / MCP-compatible hosts |
| **Playbooks** | Auto-generated incident response playbooks with SOP steps, PPE checklists, and action drafts |
| **Evaluation Suite** | RAG recall, citation integrity, unsupported claim rate, tool accuracy, and CI regression gates |
| **Observability** | Traces, spans, latency histograms, token usage, and Prometheus metrics |
| **Policy Engine** | YAML-based approval policies for tool actions (Jira tickets, Slack messages) |

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL (Drizzle ORM) or SQLite for local dev
- **AI:** OpenAI GPT-4o + text-embedding-3-small
- **Realtime:** WebSocket (voice), Server-Sent Events (chat streaming)

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

### Voice (WebSocket)

Connect to `ws://localhost:5000/ws/voice` — send `voice.session.start`, `voice.transcript`, `voice.endTurn` messages.

### MCP (stdio)

```bash
tsx server/mcp/mcpServer.ts
```

Tools: `tracepilot.chat`, `tracepilot.playbook`, `tracepilot.action_draft`, `tracepilot.action_execute`

---

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│  React SPA  │───▶│  Express API │───▶│  PostgreSQL/     │
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
- **Evaluation:** Recall@k, citation integrity, unsupported claim rate. CI gate blocks merges on regression.
- **Observability:** Request → trace → spans with latency, token usage, similarity scores.

---

## Testing

```bash
npm test                   # Unit tests
npm run test:voice-smoke   # Voice WebSocket smoke
npm run test:mcp-smoke     # MCP server smoke
npm run eval               # Golden eval suite
npm run ci                 # CI regression gate
```

---

## License

MIT
