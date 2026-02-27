# Voice Agent Test Suite

## Overview

Comprehensive automated test suite for the voice agent runtime, covering real-time voice runtime, deep-path (RAG + LLM + governance), persistence, observability, failure modes, and performance sanity checks.

## Test Matrix

See [TEST_MATRIX.md](./TEST_MATRIX.md) for the complete test plan mapping requirements → test cases → expected outcomes.

## Test Categories

### A) Realtime Voice Runtime
- WebSocket connection and start
- EOU detection (immediate and timeout-based)
- Streaming responses
- Keep-alive messages
- Barge-in handling
- Fast-path intents (schedule, support ticket)

### B) Deep-path (RAG + LLM + Governance)
- Active source versions only
- Citations format (sourceVersionId + offsets)
- Schema validation and repair
- Policy checks and approvals

### C) Persistence and Post-call Ingestion
- Call and turn persistence
- Job enqueueing on call end
- Worker job processing
- Source/version/chunk creation
- Idempotency checks

### D) Observability
- Span creation for all voice operations
- Latency metrics in span metadata
- Trace completion

### E) Failure Mode & Abuse Tests
- Disconnect handling
- Duplicate message handling
- Long input handling
- Concurrency tests

### F) Performance Sanity
- Fast-path latency (p50 < 900ms, p95 < 2500ms)
- Barge-in stop time (< 250ms)

## Running Tests

### Prerequisites

1. Database must be set up and migrated:
   ```bash
   npm run db:push
   ```

2. Server must be running (in a separate terminal):
   ```bash
   npm run dev
   ```

3. Worker must be running (in a separate terminal):
   ```bash
   npm run worker
   ```

### Run All Tests

```bash
npm run test:voice
```

Or directly with tsx:

```bash
NODE_ENV=test tsx script/test_voice_e2e.ts
```

### Test Output

The test suite will output:
- Test results per category
- Pass/fail status for each test
- Performance metrics (latency, barge-in times)
- Final summary with pass rate

Example output:

```
Voice Agent Test Suite
=====================

Running Category A: Realtime Voice Runtime...
Running Category B: Deep-path (RAG + LLM)...
Running Category C: Persistence & Ingestion...
Running Category D: Observability...
Running Category E: Failure Mode & Abuse...
Running Category F: Performance Sanity...

Test Results:
=====================
  ✅ A1: WS Connection and Start
  ✅ A2: EOU with user_final
  ...

Category Summary:
=====================
  A) Realtime Voice Runtime: 11/11 passed
  B) Deep-path (RAG + LLM): 11/11 passed
  ...

Total: 56/56 passed

Performance Metrics:
=====================
  F1 - p50: 234ms
  F1 - p95: 567ms
  F2 - max: 87ms

✅ All tests passed
```

### Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed

## Test Helper Functions

The test suite uses helper functions in `script/test_helpers.ts`:

- `createTestUser()`: Create a test user
- `createWebSocketConnection()`: Connect to WebSocket server
- `waitForWebSocketMessage()`: Wait for a specific message type
- `waitForJobCompletion()`: Wait for a job to complete
- `getSpansForCall()`: Query spans for a call
- `createTestSourceWithVersions()`: Create test source with multiple versions
- `queryVoiceCall()`, `queryVoiceTurns()`, etc.: Query database state

## Test Environment

Tests run with `NODE_ENV=test` to enable test-specific behavior (if any).

The WebSocket URL defaults to `ws://localhost:5000/ws/voice` but can be overridden with `WS_URL` environment variable:

```bash
WS_URL=ws://localhost:3000/ws/voice npm run test:voice
```

## Test Isolation

Each test category is independent and should:
- Create its own test data
- Clean up after execution
- Not depend on other tests

The test suite tracks test data (calls, sources, users) and cleans up at the end.

## Troubleshooting

### Tests fail with connection errors

Ensure the server is running on the expected port (default: 5000).

### Tests fail with database errors

Ensure the database is set up and migrated:
```bash
npm run db:push
```

### Tests timeout

Some tests may take longer if the server/worker is slow. Increase timeouts in the test file if needed.

### Worker not processing jobs

Ensure the worker is running:
```bash
npm run worker
```

## Adding New Tests

To add a new test:

1. Add the test case to the appropriate category function in `script/test_voice_e2e.ts`
2. Follow the existing pattern:
   - Create a test result object with `testId`, `name`, `passed`, optional `error` and `metrics`
   - Push to `categoryResults` array
   - Handle errors gracefully
3. Update `TEST_MATRIX.md` with the new test case

## Test Coverage

The test suite covers:
- ✅ WebSocket protocol (all message types)
- ✅ EOU detection logic
- ✅ Fast-path FSM
- ✅ Deep-path RAG/LLM flow
- ✅ Policy and approvals
- ✅ Database persistence
- ✅ Job queueing and processing
- ✅ Observability (spans/traces)
- ✅ Failure scenarios
- ✅ Performance targets

## Notes

- Tests use real database and WebSocket connections (no mocking)
- Tests require an active server and worker process
- Tests may create test data in the database (cleaned up after)
- Performance tests run multiple iterations to measure p50/p95


