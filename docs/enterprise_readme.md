
# FieldCopilot Enterprise - Increments 4, 5, 6

This document details the enterprise-grade implementation of FieldCopilot, including database verification, observability, and approval workflows.

## 1. Setup & Database

We support a robust SQLite fallback for local development alongside Postgres support.

### Prerequisites

- Node.js v18+
- SQLite (local) or PostgreSQL (production)

### Quick Start (Local SQLite)

1.  **Initialize Database:**
    ```bash
    npm run db:up
    ```
    This sets up `.data/dev.db` and configures the environment.

2.  **Switch to SQLite Schema:**
    The system automatically detects the dialect via `DATABASE_DIALECT=sqlite`.
    To ensure schema compatibility for scripts:
    ```bash
    npx tsx scripts/switch_to_sqlite.ts
    ```

3.  **Run Migrations:**
    ```bash
    npm run db:migrate
    ```

4.  **Seed Data:**
    ```bash
    npm run seed:e2e
    ```

5.  **Verify Integrity:**
    ```bash
    npm run db:smoke
    ```

## 2. Verification

We provide a comprehensive verification suite checking DB state, UI availability, and Logic correctness.

```bash
npm run verify
```

This script checks:
- Database population (tables, traces, eval cases)
- Observability UI availability
- Evaluation Metrics
- Approval Workflow wiring

## 3. Features Implemented

### Observability Dashboard (`/admin/observability`)
- **Chat**: Conversation traces, token usage, latency.
- **Retrieval**: Chunk access frequency, active sources.
- **Citations**: Integrity rate, "hallucinated" vs "grounded".
- **Sync**: Connector health, throughput, error rates.

### Evaluation System
- **Recall@k**: Measures retrieval quality.
- **Citation Integrity**: Checks if citations support claims.
- **Regression Testing**: `npm run eval` runs 50+ cases and compares against baseline.

### Decision → Jira Workflow
- **Slack Citation**: Extract decisions from Slack threads.
- **Approval Modal**: Propose/Edit Jira tickets before creation.
- **Audit Logging**: All approvals logged in `approvals` and `audit_events`.

## 4. Troubleshooting

**Common Issues:**

- `SqliteError: no such function: gen_random_uuid`:
  - Run `npx tsx scripts/switch_to_sqlite.ts` to patch the schema.
  - Re-run migrations.

- `no such table: eval_cases`:
  - Ensure migrations ran: `npm run db:migrate`.

- `DB verification failed: No traces found`:
  - Run `npx tsx scripts/fetch_observability.ts` (with `OPENAI_API_KEY=mock`) to generate traffic.

## 5. Demo Scripts

- **Seed**: `npm run seed:e2e` creates 50 test cases.
- **Eval**: `npm run eval` executes the test suite.
- **Traffic**: `npx tsx scripts/fetch_observability.ts` simulates admin activity.
