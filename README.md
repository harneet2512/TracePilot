# FieldCopilot

Enterprise-grade field operations AI assistant with RAG, tool integration, and observability.

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind + shadcn/ui
- **Backend**: Express.js + TypeScript
- **DB**: PostgreSQL + Drizzle ORM
- **AI**: OpenAI GPT-4o + text-embedding-3-small

## Setup

### Quick Start (Fresh Clone → Running)

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
# Option A: Create .env file (recommended for worker script)
cp .env.example .env
# Edit .env and set:
#   DATABASE_URL=postgresql://user:password@localhost:5432/fieldcopilot
#   OPENAI_API_KEY=sk-...

# Option B: Set env vars in shell (for dev/test scripts)
# Windows PowerShell:
$env:DATABASE_URL="postgresql://user:password@localhost:5432/fieldcopilot"
$env:OPENAI_API_KEY="sk-..."
```

3. **Start PostgreSQL database:**
```bash
# For development: Ensure PostgreSQL is running locally
# For tests: Use test DB container
# Windows:
powershell script/db_test_up.ps1
# Unix/Mac:
bash script/db_test_up.sh
```

4. **Push database schema:**
```bash
npm run db:push
```

5. **Verify readiness:**
```bash
npm run ready dev  # Check dev environment
npm run ready test # Check test environment
```

6. **Start development server:**
```bash
# Terminal 1: Start server (choose one)
npm run dev          # Without .env file (env vars from shell)
npm run dev:dotenv   # With .env file (requires dotenv package)

# Terminal 2: Start worker (required for async jobs)
npm run worker
```

7. **Run smoke tests (requires server running):**
```bash
npm run test:voice-smoke  # Voice WebSocket test
npm run test:mcp-smoke    # MCP server test
```

### Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API key

**Optional (for OAuth integrations):**
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `ATLASSIAN_CLIENT_ID` / `ATLASSIAN_CLIENT_SECRET`
- `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`

**Note:** 
- Worker script (`npm run worker`) uses `-r dotenv/config` and loads `.env` file
- Dev/test scripts don't use dotenv by default (env vars from shell)
- Use `npm run dev:dotenv` if you want dev server to load `.env` file

### Database Setup

**Development:**
- Ensure PostgreSQL is running locally
- Set `DATABASE_URL` to your local database
- Run `npm run db:push` to create schema

**Tests:**
- Use test DB container: `powershell script/db_test_up.ps1` (Windows) or `bash script/db_test_up.sh` (Unix/Mac)
- Creates container `fieldcopilot_test_db` on port 5433
- Set `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/fieldcopilot_test`
- Set `NODE_ENV=test`

### Seed Initial Data

After server is running:
```bash
# Seed admin user and default policy
curl -X POST http://localhost:5000/api/seed

# Seed evaluation cases
npm run seed:evals
```

## Quickstart for Digital Native Teams

**New to FieldCopilot?** Start here for a fast path to production.

### Normal Mode (HTTP) Quickstart

**1. Get Running (5 minutes)**

```bash
# Install and start
npm install
npm run db:push
npm run dev

# In another terminal, start worker
npm run worker
```

**2. Ingest Your First Document (2 minutes)**

```bash
# Upload a document via web UI
# Navigate to http://localhost:5000/admin/ingest
# Or use API:
curl -X POST http://localhost:5000/api/ingest \
  -H "Cookie: session=YOUR_SESSION" \
  -F "files=@your-document.pdf"
```

**3. Ask Your First Question (1 minute)**

```bash
# Via web UI: http://localhost:5000/chat
# Or via API:
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{"message": "What are the safety procedures?"}'
```

**4. Connect Tools (Optional, 10 minutes)**

- **Jira**: Navigate to `/connect/atlassian` and authorize
- **Slack**: Navigate to `/connect/slack` and authorize
- **Confluence**: Navigate to `/connect/atlassian` (same as Jira)

**5. Create Your First Playbook (2 minutes)**

```bash
curl -X POST http://localhost:5000/api/playbooks \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION" \
  -d '{"incidentText": "Equipment failure in production line 3"}'
```

### Voice Mode (WebSocket) Quickstart

**1. Start Server**

```bash
npm run dev
```

**2. Connect via WebSocket**

```bash
# Connect to ws://localhost:5000/ws/voice
# Example using Node.js:
node -e "
const ws = require('ws');
const client = new ws('ws://localhost:5000/ws/voice');
client.on('open', () => {
  // Start session
  client.send(JSON.stringify({
    type: 'voice.session.start',
    sessionId: 'test-1',
    userId: 'user-1',
    mode: 'transcript'
  }));
});
client.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg.type);
  if (msg.type === 'voice.turn.result') {
    console.log('Answer:', msg.answerText);
    console.log('Citations:', msg.citations?.length || 0);
  }
});
"
```

**3. Send Transcript Messages**

```javascript
// Send transcript
client.send(JSON.stringify({
  type: "voice.transcript",
  sessionId: "test-1",
  text: "What are the safety procedures?",
  messageId: "msg-1"
}));

// End turn
client.send(JSON.stringify({
  type: "voice.endTurn",
  sessionId: "test-1"
}));
```

**4. Run Smoke Test**

```bash
npm run test:voice-smoke
# Or manually:
WS_URL=ws://localhost:5000/ws/voice tsx script/voice-smoke.ts
```

### MCP Mode (stdio) Quickstart

**1. Install MCP SDK (if not already installed)**

```bash
npm install @modelcontextprotocol/sdk
```

**2. Run MCP Server**

```bash
# Start MCP server (stdio transport)
tsx server/mcp/mcpServer.ts
```

**3. Configure Claude Desktop (or MCP host)**

Add to Claude Desktop's MCP configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fieldcopilot": {
      "command": "tsx",
      "args": ["/path/to/Field-Copilot-1/server/mcp/mcpServer.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/fieldcopilot",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

**4. Use MCP Tools in Claude Desktop**

- `fieldcopilot.chat` - Chat with FieldCopilot agent
- `fieldcopilot.playbook` - Generate incident response playbook
- `fieldcopilot.action_draft` - Draft a tool action
- `fieldcopilot.action_execute` - Execute approved action

**5. Run Smoke Test**

```bash
npm run test:mcp-smoke
# Or manually:
tsx script/mcp-smoke.ts
```

**6. Access MCP Resources**

- `fieldcopilot://status` - Build info, enabled connectors, env checks
- `fieldcopilot://evals` - List eval suites + latest run summary

**Next Steps:**
- Read `ONBOARDING_PLAYBOOK.md` for full setup guide
- Check `WORKSHOP_MATERIALS.md` for hands-on exercises
- Review `EVAL_RUBRIC.md` to understand evaluation criteria

## Voice Agent

Enterprise-grade, low-latency voice agent runtime with:
- Real-time WebSocket communication (`/ws/voice`)
- EOU detection (250-350ms timeout)
- Barge-in handling (<250ms stop)
- Fast-path FSM for common intents (schedule, support ticket)
- Deep-path with RAG + LLM + policy/approvals
- Post-call transcript ingestion
- Comprehensive observability spans

### Voice Agent Usage

1. **Start server and worker:**
```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Start worker
npm run worker
```

2. **Test with simulation script:**
```bash
tsx script/voice_sim.ts
```

3. **Or use the web UI:**
- Navigate to `/voice` page
- Click "Connect"
- Type messages and send
- View latency KPIs and transcript

### Voice Agent Features

- **Fast-path:** Handles schedule and support ticket intents without LLM
- **Deep-path:** Uses RAG retrieval + LLM for complex queries
- **Barge-in:** Interrupt assistant mid-response (<250ms)
- **Observability:** All operations emit spans with latency breakdown
- **Post-call:** Transcripts automatically ingested as searchable sources

See `VOICE_AGENT_PROOF.md` for detailed implementation proof and SQL queries.

## Running the Application

### Development Mode

Start the web server and API:
```bash
npm run dev
```

The app will be available at `http://localhost:5000`

### Production Mode

1. Build the application:
```bash
npm run build
```

2. Start the server:
```bash
npm start
```

3. Start the worker (in a separate process):
```bash
npm run worker
```

## Key Features

### 1. Manual Upload Ingestion (Job-Based)

Upload files via `/api/ingest` endpoint. Files are queued as jobs and processed asynchronously:

```bash
curl -X POST http://localhost:5000/api/ingest \
  -H "Cookie: session=YOUR_SESSION_TOKEN" \
  -F "files=@document.pdf"
```

- Creates or updates source identity
- Enqueues `ingest_manual_upload` job
- Returns immediately with `jobId`
- Job handler processes: extract → chunk → embed → upsert
- Idempotent: same content hash = skip processing

### 2. Source Versioning

- **sources** = identity (stable across versions)
- **sourceVersions** = immutable snapshots
- **chunks** belong to sourceVersions
- Only active sourceVersions are used for retrieval
- Citations include `sourceVersionId` + `charStart`/`charEnd`

### 3. Job Runner

Features:
- **Locking**: `FOR UPDATE SKIP LOCKED` for safe concurrent processing
- **Concurrency**: Per connectorType AND per connectorAccountId limits
- **Rate Limiting**: Token bucket per accountId/connectorType
- **Retries**: Exponential backoff for 429/5xx errors
- **Dead Letter Queue**: Failed jobs after maxAttempts

### 4. Observability

Access at `/admin/observability`:
- Traces and spans for all operations
- Metrics: request count, error rate, latency (p50/p95), token usage
- Filters: date range, connector type, tool name
- Dashboards: Chat, Retrieval, Citations, Actions, Sync

### 5. Evaluation Suite

Run evaluations:
```bash
# Run a specific suite
npm run eval "Basic QNA Suite"

# Or via API
curl -X POST http://localhost:5000/api/eval-suites/:id/run \
  -H "Cookie: session=YOUR_SESSION_TOKEN"
```

Metrics computed:
- **RAG**: Recall@k, Citation Integrity, Unsupported Claim Rate
- **Actions**: Tool Selection Accuracy, Parameter Correctness, Policy Compliance
- **Agentic**: Task Success Rate, Steps to Success, Cost per Success

### 6. CI Regression Gate

Run CI gate to check for regressions:
```bash
npm run ci
```

Fails if:
- TSR drops > 3%
- Unsupported claim rate rises > 2%
- Cost per success rises > 10% without TSR improvement

### 7. Playbooks

Create incident response playbooks:

1. Navigate to `/playbooks/new`
2. Enter incident description
3. System generates:
   - SOP steps with citations
   - PPE checklist
   - Shutdown procedures
   - Action drafts (Jira/Slack) with policy checks

View playbooks at `/playbooks` and detail at `/playbooks/:id`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Ingestion
- `POST /api/ingest` - Upload files (queued as jobs)
- `GET /api/jobs/:id` - Get job status

### Chat
- `POST /api/chat` - Chat with RAG retrieval
- `POST /api/actions/execute` - Execute tool actions

### Playbooks
- `POST /api/playbooks` - Create playbook from incident text
- `GET /api/playbooks` - List user's playbooks
- `GET /api/playbooks/:id` - Get playbook detail
- `POST /api/playbooks/:id/replay` - Regenerate playbook

### Evaluation
- `GET /api/eval-suites` - List eval suites
- `POST /api/eval-suites` - Create eval suite
- `POST /api/eval-suites/:id/run` - Run eval suite
- `GET /api/eval-runs` - List eval runs
- `GET /api/eval-runs/:id` - Get eval run results

### Observability (Admin)
- `GET /api/admin/traces` - Get traces
- `GET /api/admin/observability/metrics` - Get metrics

## Database Schema

Key tables:
- `sources` - Document identity
- `source_versions` - Immutable document versions
- `chunks` - Text chunks linked to sourceVersions
- `jobs` / `job_runs` - Job queue system
- `traces` / `spans` - Observability data
- `eval_suites` / `eval_cases` / `eval_runs` / `eval_results` - Evaluation system
- `playbooks` / `playbook_items` - Incident playbooks

## Development

### Type Checking
```bash
npm run check
```

### Database Migrations
```bash
npm run db:push
```

## Testing

1. Seed data:
```bash
npm run seed:evals
```

2. Run evaluations:
```bash
npm run eval
```

3. Check for regressions:
```bash
npm run ci
```

## CI Pipeline

The repository includes a GitHub Actions CI pipeline (`.github/workflows/ci.yml`) that:

- Runs type checking (`npm run check`)
- Seeds evaluation cases
- Runs evaluation suite
- Executes CI gate to check for regressions
- Blocks merges if thresholds are violated

**Thresholds:**
- TSR drop > 3% → fail
- Unsupported claim rate rise > 2% → fail
- Cost per success rise > 10% without TSR improvement → fail

CI reports are saved to `eval-reports/` directory.

## Voice E2E Tests

Comprehensive automated test suite for the voice agent runtime (56 test cases).

### Prerequisites

1. **Docker** must be installed and running
2. **PostgreSQL 16** will be started in a Docker container

### Setup

1. **Start the test database:**

   **Unix/macOS:**
   ```bash
   bash script/db_test_up.sh
   ```

   **Windows PowerShell:**
   ```powershell
   powershell script/db_test_up.ps1
   ```

   This creates a PostgreSQL 16 container named `fieldcopilot_test_db` on port 5433.

2. **Configure environment:**

   Copy `.env.example` to `.env` and set:
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/fieldcopilot_test
   NODE_ENV=test
   ```

   **Windows PowerShell alternative** (if .env doesn't work):
   ```powershell
   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/fieldcopilot_test"
   $env:NODE_ENV="test"
   ```

3. **Run database migrations:**
   ```bash
   npm run db:push
   ```

4. **Run the test suite:**
   ```bash
   npm run test:voice
   ```

### Test Coverage

The suite covers:
- **Realtime Voice Runtime** (11 tests): WebSocket protocol, EOU detection, streaming, barge-in, fast-path
- **Deep-path** (11 tests): RAG retrieval, LLM, schema validation, policy checks, approvals
- **Persistence** (12 tests): Call/turn storage, job enqueueing, source versioning, idempotency
- **Observability** (10 tests): Spans, traces, latency metrics
- **Failure Modes** (8 tests): Disconnects, duplicates, long input, concurrency
- **Performance** (4 tests): Latency bounds, barge-in stop times

### Troubleshooting

**DATABASE_URL missing error:**
- Ensure `.env` file exists with `DATABASE_URL` set
- Or export the environment variable before running tests
- Check that the test database container is running: `docker ps | grep fieldcopilot_test_db`

**Port 5433 already in use:**
- Stop the existing container: `docker stop fieldcopilot_test_db`
- Or change the port in `db_test_up.sh`/`db_test_up.ps1` and update `DATABASE_URL`

**Database connection errors:**
- Wait a few seconds after starting the container for PostgreSQL to initialize
- Verify container is running: `docker ps`
- Check container logs: `docker logs fieldcopilot_test_db`

## Architecture

### Job Processing Flow

1. API endpoint enqueues job → `jobs` table
2. Worker polls with `FOR UPDATE SKIP LOCKED`
3. Worker checks concurrency limits → `job_locks` table
4. Worker checks rate limits → `rate_limit_buckets` table
5. Worker executes handler → creates `job_runs`
6. Handler processes → updates `job_runs.statsJson`
7. On failure → retry with exponential backoff or move to dead_letter

### Source Versioning Flow

1. Ingest file → compute `contentHash`
2. Check if newest active version has same hash → skip if duplicate
3. Else: deactivate all previous versions → create new `sourceVersion` → create chunks linked to version
4. Retrieval: only query chunks from active `sourceVersions`
5. Citations: include `sourceVersionId` + `charStart`/`charEnd`

### Tracing Flow

1. Request starts → create `trace`
2. Operations create `spans` linked to trace
3. Spans include: latency, token usage, similarity scores, error codes
4. Dashboard aggregates spans into metrics

## License

MIT

