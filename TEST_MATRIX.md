# Voice Agent Test Matrix

## Overview

Comprehensive test plan mapping requirements → test cases → expected outcomes for the voice agent runtime.

## Test Categories

### A) Realtime Voice Runtime

| Requirement | Test Case | Expected Outcome | Test ID |
|------------|-----------|------------------|---------|
| **WS Connection** | Send `{type: "start"}` to `/ws/voice` | Receives `{type: "started", callId}` | `A1` |
| **EOU - user_final** | Send `{type: "user_final", text: "Hello"}` | EOU handled immediately (<50ms) | `A2` |
| **EOU - timeout** | Send `{type: "user_partial"}`, wait 300ms, no more partials | EOU detected after ~300ms | `A3` |
| **EOU - partials reset** | Send partials every 200ms for 1s, then stop | EOU detected ~300ms after last partial | `A4` |
| **Streaming Response** | Send user message, receive response | Receives multiple `assistant_delta` then `assistant_final` | `A5` |
| **Keep-alive** | Send query that takes >600ms, measure | Receives `ack` within 700ms | `A6` |
| **Barge-in Stop** | Send `barge_in` during streaming, measure | Receives `tts_stop` within 250ms | `A7` |
| **Fast-path Schedule** | Send "I need to schedule an appointment" | Response received without LLM span | `A8` |
| **Fast-path Schedule Slots** | Send schedule intent, verify slot collection | Correct slots collected, appropriate prompts | `A9` |
| **Fast-path Support Ticket** | Send "I need to create a support ticket" | Response received without LLM span | `A10` |
| **Fast-path Support Slots** | Send ticket intent, verify slot collection | Summary and severity collected | `A11` |

### B) Deep-path (RAG + LLM + Governance)

| Requirement | Test Case | Expected Outcome | Test ID |
|------------|-----------|------------------|---------|
| **Active Source Versions** | Create source with 2 versions (v1 active, v2 inactive), query | Only v1 chunks in retrieval | `B1` |
| **Source Version Update** | Create v2, make it active, deactivate v1, query | Only v2 chunks in retrieval | `B2` |
| **Citations Include Version** | Retrieve with RAG, check citations | Citations have `sourceVersionId` | `B3` |
| **Citations Include Offsets** | Retrieve with RAG, check citations | Citations have `charStart` and `charEnd` within bounds | `B4` |
| **Schema Validation - Valid** | Send query that returns valid JSON | Response validated successfully | `B5` |
| **Schema Validation - Invalid + Repair** | Mock LLM to return invalid JSON | One repair attempt, then valid response | `B6` |
| **Schema Validation - Repair Fails** | Mock LLM to return invalid JSON twice | Safe fallback response, no approvals/tools | `B7` |
| **Policy - Allowed Action** | Send query suggesting allowed action | Policy span shows `allow: true` | `B8` |
| **Policy - Denied Action** | Send query suggesting denied action | Policy span shows `deny: true`, explainable reason | `B9` |
| **Policy - Requires Approval** | Send query with action requiring approval | Approval row created, `requiresApproval: true` | `B10` |
| **No Auto-Execute** | Send query with suggested action | Action not executed, only approval created | `B11` |

### C) Persistence and Post-call Ingestion

| Requirement | Test Case | Expected Outcome | Test ID |
|------------|-----------|------------------|---------|
| **Call Created** | Send `start` message | `voice_calls` row created with `status='active'` | `C1` |
| **User Turn Persisted** | Send `user_final` | `voice_turns` row created with `role='user'` | `C2` |
| **Assistant Turn Persisted** | Receive response | `voice_turns` row created with `role='assistant'` | `C3` |
| **Turn JSON Metadata** | Send user message | Turn has `turnJson` with `partialCount`, `eouMs` | `C4` |
| **Call Completion** | Send `end` message | `voice_calls` row updated to `status='completed'` | `C5` |
| **Job Enqueued** | Send `end` message | Job created with `type='ingest_call_transcript'` | `C6` |
| **Job Processing** | Wait for worker to process job | `job_runs` created with `stats_json` | `C7` |
| **Source Created** | After job processing | `sources` row created with `type='voice_call'` | `C8` |
| **Source Version Created** | After job processing | `source_versions` row created with `isActive=true` | `C9` |
| **Chunks Created** | After job processing | `chunks` rows created with `sourceVersionId` FK | `C10` |
| **Idempotency - Same Transcript** | Process same call twice | Second run skips (duplicate detection) | `C11` |
| **Versioning - Changed Transcript** | Update turns, process again | New `sourceVersion` created, old deactivated | `C12` |

### D) Observability

| Requirement | Test Case | Expected Outcome | Test ID |
|------------|-----------|------------------|---------|
| **Session Start Span** | Send `start` | Span `voice.session.start` exists | `D1` |
| **EOU Span** | Send user message | Span `voice.turn.eou_detected` with `eouMs`, `partialCount` | `D2` |
| **Fast-path Span** | Use fast-path intent | Span `voice.turn.fast_path` with intent, slotsFilledCount | `D3` |
| **Retrieve Span** | Use deep-path | Span `voice.turn.retrieve` with similarity stats | `D4` |
| **LLM Span** | Use deep-path | Span `voice.turn.llm` with tokens, model, latency | `D5` |
| **Policy Span** | Send action suggestion | Span `voice.turn.policy` with allow/deny, ruleName | `D6` |
| **Approvals Span** | Create approval | Span `voice.turn.approvals` with approvalsCreatedCount | `D7` |
| **Barge-in Span** | Send barge_in | Span `voice.turn.barge_in` with `bargeInStopMs` | `D8` |
| **Trace Completed** | End call | Trace `kind='voice'` with `status='completed'` | `D9` |
| **Latency Metrics** | Collect spans | `eouMs`, `latencyMs`, `bargeInStopMs` present in metadata | `D10` |

### E) Failure Mode & Abuse Tests

| Requirement | Test Case | Expected Outcome | Test ID |
|------------|-----------|------------------|---------|
| **Disconnect Mid-turn** | Connect, send message, disconnect abruptly | No crash, session cleaned up | `E1` |
| **Duplicate Start** | Send two `start` messages | Only one call created | `E2` |
| **Duplicate Turns** | Send same turn twice | Only one turn row created (or handled gracefully) | `E3` |
| **Long Input** | Send very long text (>10k chars) | Handled safely (truncated or error) | `E4` |
| **Concurrency - 10 Sessions** | Open 10 parallel WS connections | All processed, no deadlocks | `E5` |
| **Concurrency - Job Claiming** | Multiple workers claim jobs | Only one worker gets each job (SKIP LOCKED) | `E6` |
| **Invalid Message Format** | Send malformed JSON | Error response, connection stays alive | `E7` |
| **Missing callId** | Send message without callId after start | Error response or handled gracefully | `E8` |

### F) Performance Sanity

| Requirement | Test Case | Expected Outcome | Test ID |
|------------|-----------|------------------|---------|
| **Fast-path Latency** | Measure EOU → first response | p50 < 900ms, p95 < 2500ms | `F1` |
| **Barge-in Stop Time** | Measure barge_in → tts_stop | < 250ms (wall clock) | `F2` |
| **Deep-path Latency** | Measure EOU → first delta (deep-path) | Reasonable latency (< 5s for sanity) | `F3` |
| **Keep-alive Timing** | Measure deep-path >600ms | `ack` sent within 700ms | `F4` |

## Test Implementation Strategy

### Test Harness Architecture

```
test_voice_e2e.ts (main runner)
├── testHelpers.ts (utilities)
│   ├── createTestUser()
│   ├── waitForWebSocketMessage()
│   ├── waitForJobCompletion()
│   ├── querySpans()
│   └── queryDB()
├── A_realtime.ts (Category A tests)
├── B_deeppath.ts (Category B tests)
├── C_persistence.ts (Category C tests)
├── D_observability.ts (Category D tests)
├── E_failure.ts (Category E tests)
└── F_performance.ts (Category F tests)
```

### Test Execution Flow

1. **Setup:**
   - Connect to test database
   - Create test user (or use existing)
   - Start test server (or use existing)
   - Start worker (or process jobs directly)

2. **Run Tests:**
   - For each test category (A-F):
     - Setup test data (sources, versions, etc.)
     - Execute test scenarios
     - Assert outcomes
     - Cleanup

3. **Assertions:**
   - WebSocket message assertions
   - Database state assertions (SQL queries)
   - Span assertions (trace/spans tables)
   - Latency measurements

4. **Teardown:**
   - Clean up test data
   - Close connections
   - Report results

### Helper Functions

```typescript
// Wait for WebSocket message with timeout
async function waitForMessage(ws: WebSocket, type: string, timeoutMs: number): Promise<any>

// Wait for job to complete
async function waitForJobCompletion(jobId: string, timeoutMs: number): Promise<JobRun>

// Query spans for a trace
async function getSpansForTrace(traceId: string): Promise<Span[]>

// Query spans for a call
async function getSpansForCall(callId: string): Promise<Span[]>

// Create test source with versions
async function createTestSourceWithVersions(content: string, versions: number): Promise<{sourceId: string, versionIds: string[]}>

// Measure latency between two events
function measureLatency(startTime: number, endTime: number): number
```

## Expected Test Results

### Pass Criteria
- ✅ All tests pass (exit code 0)
- ✅ No crashes or unhandled errors
- ✅ All assertions pass
- ✅ Performance targets met (where measurable)

### Failure Criteria
- ❌ Any test fails (exit code 1)
- ❌ Assertion failures
- ❌ Timeouts
- ❌ Performance targets not met

## Test Data Requirements

### Pre-test Setup
- Test user created or available
- Test sources with multiple versions (for B1, B2)
- Test policy configured (for B8, B9, B10)
- Clean database state (or use test database)

### Test Isolation
- Each test should be independent
- Clean up test data after each test
- Use unique IDs to avoid conflicts

## Metrics Collection

### Latency Metrics
- EOU → First Delta (p50, p95)
- EOU → Final (p50, p95)
- Barge-in Stop Time (avg, max)
- Keep-alive Timing (verify < 700ms)

### Reliability Metrics
- Test pass rate
- Timeout rate
- Error rate
- Deadlock detection (concurrency tests)

## Output Format

```
Voice Agent Test Suite
=====================

Test Results:
  A) Realtime Voice Runtime:      11/11 passed
  B) Deep-path (RAG + LLM):       11/11 passed
  C) Persistence & Ingestion:     12/12 passed
  D) Observability:               10/10 passed
  E) Failure Mode & Abuse:         8/8  passed
  F) Performance Sanity:           4/4  passed

Total: 56/56 passed

Performance Metrics:
  Fast-path Latency:
    p50: 234ms
    p95: 567ms
  Barge-in Stop Time:
    avg: 87ms
    max: 156ms
  Deep-path Latency:
    p50: 1.2s
    p95: 2.8s

✅ All tests passed
```


