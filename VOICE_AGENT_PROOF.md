# Voice Agent Implementation - Proof of Implementation

## Overview

Enterprise-grade, low-latency voice agent runtime implemented with:
- ✅ WebSocket-based real-time communication
- ✅ EOU detection (250-350ms timeout)
- ✅ Barge-in handling (<250ms stop)
- ✅ Fast-path FSM for common intents (schedule, support ticket)
- ✅ Deep-path with RAG + LLM + policy/approvals
- ✅ Post-call transcript ingestion
- ✅ Comprehensive observability spans

## Implementation Summary

### Phase 0 - Discovery ✅
**Report:** `Field-Copilot-1/PHASE0_DISCOVERY.md`

All required components located and documented.

### Phase 1 - Realtime Voice Runtime ✅

**Files Created/Modified:**
- `Field-Copilot-1/server/lib/voice/websocket.ts` - Main WebSocket handler (766 lines)
- `Field-Copilot-1/shared/schema.ts` - Added `voice_calls` and `voice_turns` tables
- `Field-Copilot-1/server/storage.ts` - Added voice storage methods
- `Field-Copilot-1/server/routes.ts` - Wired WebSocket setup

**Key Features:**
1. **WebSocket Endpoint:** `/ws/voice` attached to HTTP server
2. **EOU Detection:** 300ms timeout after last `user_partial`
3. **Barge-in:** Stops streaming within <250ms, sends `tts_stop`
4. **Fast-path FSM:**
   - Schedule intent: collects date, time, duration slots
   - Support ticket intent: collects summary, severity
   - Responds immediately without LLM
5. **Keep-alive:** Sends `ack` if no response within 600ms

### Phase 2 - Deep-path ✅

**Implementation:**
- Retrieval: Uses `storage.getActiveChunks()` → `searchSimilar()` (active sourceVersions only)
- LLM: Calls GPT-4o with compact JSON schema
- Validation: Uses `validateWithRepair()` with 1 repair attempt
- Policy: Checks actions with `checkPolicy()`, creates approvals if required
- Streaming: Splits response by sentences, streams as `assistant_delta` chunks

### Phase 3 - Persistence ✅

**Database Tables:**
- `voice_calls`: id, userId, status, callerNumber, metadataJson, startedAt, completedAt
- `voice_turns`: id, callId, role, text, traceId, turnJson

**Post-call Ingestion:**
- Job handler: `Field-Copilot-1/server/lib/jobs/handlers/ingestCallTranscriptHandler.ts`
- Creates source with `type="voice_call"`
- Computes contentHash, creates sourceVersion, chunks, indexes
- Idempotent: skips if active version hash matches

### Phase 4 - Observability ✅

**Spans Emitted:**
- `voice.session.start` - Call started
- `voice.turn.eou_detected` - EOU detected (attrs: eouMs, partialCount)
- `voice.turn.fast_path` - Fast-path handled (attrs: state, intent, slotsFilledCount, latencyMs)
- `voice.turn.retrieve` - RAG retrieval (attrs: topK, similarity stats)
- `voice.turn.llm` - LLM call (attrs: tokens, model, latencyMs)
- `voice.turn.policy` - Policy check (attrs: allow/deny, ruleName)
- `voice.turn.approvals` - Approvals created (attrs: approvalsCreatedCount)
- `voice.turn.barge_in` - Barge-in occurred (attrs: bargeInStopMs)

**Frontend:**
- `/voice` page with WebSocket client
- Displays latency KPIs (EOU→firstDelta, EOU→final)
- Observability dashboard includes "Voice" filter

## Commands to Run

### 1. Database Migration
```bash
npm run db:push
```

This will create:
- `voice_calls` table
- `voice_turns` table
- Update `jobs.type` enum to include `ingest_call_transcript`
- Update `sources.type` enum to include `voice_call`
- Update `traces.kind` enum to include `voice`

### 2. Start Development Server
```bash
npm run dev
```

Server will:
- Start HTTP server on port 5000
- Attach WebSocket server to `/ws/voice`
- Start job runner

### 3. Start Worker (in separate terminal)
```bash
npm run worker
```

Worker will:
- Poll for jobs with `FOR UPDATE SKIP LOCKED`
- Process `ingest_call_transcript` jobs
- Create sourceVersions and chunks for call transcripts

### 4. Run Voice Simulation Script
```bash
tsx script/voice_sim.ts
```

Or with custom URL:
```bash
WS_URL=ws://localhost:5000/ws/voice?userId=test-user tsx script/voice_sim.ts
```

## Expected Logs

### Server Logs
```
[VoiceWS] WebSocket server listening on /ws/voice
[VoiceWS] New connection
[VoiceWS] Call started: <callId>
[Sim] Connected to voice WebSocket
[Sim] Call started: <callId>
[Sim] Sending user_partial: "I need to"
[Sim] Sending user_final: "I need to schedule an appointment for tomorrow at 2pm"
[VoiceWS] EOU detected, eouMs: 300, partialCount: 3
[VoiceWS] Fast-path handled: schedule intent
[Sim] Assistant finished speaking
[JobRunner] Enqueued job <jobId> (ingest_call_transcript)
[JobRunner] Processing job <jobId> (ingest_call_transcript)
[JobRunner] Job <jobId> completed successfully in <duration>ms
```

### Worker Logs
```
[JobRunner] Starting worker worker-<id>
[JobRunner] Processing job <jobId> (ingest_call_transcript), attempt 1
[JobRunner] Job <jobId> completed successfully in <duration>ms
```

## SQL Queries to Verify

### 1. Check Voice Calls
```sql
SELECT id, user_id, status, caller_number, started_at, completed_at 
FROM voice_calls 
ORDER BY started_at DESC 
LIMIT 10;
```

### 2. Check Voice Turns
```sql
SELECT id, call_id, role, text, trace_id, created_at 
FROM voice_turns 
ORDER BY created_at DESC 
LIMIT 20;
```

### 3. Check Jobs and Job Runs
```sql
SELECT j.id, j.type, j.status, jr.status, jr.stats_json 
FROM jobs j 
LEFT JOIN job_runs jr ON jr.job_id = j.id 
WHERE j.type = 'ingest_call_transcript' 
ORDER BY j.created_at DESC 
LIMIT 10;
```

### 4. Check Sources and Source Versions
```sql
SELECT s.id, s.type, s.title, sv.version, sv.is_active, sv.content_hash 
FROM sources s 
JOIN source_versions sv ON sv.source_id = s.id 
WHERE s.type = 'voice_call' 
ORDER BY s.created_at DESC 
LIMIT 10;
```

### 5. Check Chunks
```sql
SELECT c.id, c.source_id, c.source_version_id, c.chunk_index, 
       LEFT(c.text, 50) as text_preview 
FROM chunks c 
JOIN sources s ON s.id = c.source_id 
WHERE s.type = 'voice_call' 
ORDER BY c.created_at DESC 
LIMIT 20;
```

### 6. Check Spans
```sql
SELECT s.id, s.name, s.kind, s.duration_ms, s.metadata_json, t.kind as trace_kind
FROM spans s
JOIN traces t ON t.id = s.trace_id
WHERE s.name LIKE 'voice.%' OR t.kind = 'voice'
ORDER BY s.created_at DESC
LIMIT 50;
```

### 7. Check Traces
```sql
SELECT id, kind, status, duration_ms, started_at, finished_at 
FROM traces 
WHERE kind = 'voice' 
ORDER BY started_at DESC 
LIMIT 10;
```

## Test Scenarios

### Scenario 1: Fast-path Schedule Intent
1. Connect to WebSocket
2. Send: `{type: "start", callerNumber: "+1234567890"}`
3. Send partials: "I need to", "schedule", "an appointment"
4. Send final: "I need to schedule an appointment for tomorrow at 2pm"
5. **Expected:** Fast-path responds immediately with confirmation
6. **Verify:** `voice_turns` has turn with `turnJson.fastPath = true`

### Scenario 2: Deep-path with RAG
1. Connect and start call
2. Send: "What is the procedure for handling a security incident?"
3. **Expected:** 
   - EOU detected after 300ms
   - Retrieval span recorded
   - LLM called
   - Response streamed as `assistant_delta` chunks
   - Citations included in `assistant_final`
4. **Verify:** Spans show `voice.turn.retrieve` and `voice.turn.llm`

### Scenario 3: Barge-in
1. Connect and start call
2. Send user message that triggers deep-path
3. While assistant is streaming, send: `{type: "barge_in", callId: "...", tsMs: ...}`
4. **Expected:** 
   - `tts_stop` sent immediately (<250ms)
   - Streaming stops
   - `voice.turn.barge_in` span recorded with `bargeInStopMs`
5. **Verify:** Span metadata shows `bargeInStopMs < 250`

### Scenario 4: Post-call Ingestion
1. Complete a call (send `{type: "end"}`)
2. **Expected:**
   - Job enqueued: `type="ingest_call_transcript"`
   - Worker processes job
   - Source created with `type="voice_call"`
   - SourceVersion created with transcript
   - Chunks created and indexed
3. **Verify:**
   - `jobs` table has completed job
   - `sources` table has voice_call source
   - `chunks` table has chunks linked to sourceVersion

## Latency Targets

### Measured Metrics
- **EOU → First Delta:** Target p50 < 900ms, p95 < 2500ms
- **Barge-in Stop:** Target < 250ms
- **Fast-path Response:** Immediate (< 100ms)

### How to Measure
1. Use `/voice` page and check latency KPIs displayed
2. Query spans:
```sql
SELECT 
  AVG(CAST(metadata_json->>'latencyMs' AS INTEGER)) as avg_latency,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY CAST(metadata_json->>'latencyMs' AS INTEGER)) as p95_latency
FROM spans 
WHERE name = 'voice.turn.fast_path' 
  AND metadata_json->>'latencyMs' IS NOT NULL;
```

## File Structure

```
Field-Copilot-1/
├── server/
│   ├── lib/
│   │   ├── voice/
│   │   │   └── websocket.ts          # WebSocket handler (766 lines)
│   │   ├── jobs/
│   │   │   └── handlers/
│   │   │       └── ingestCallTranscriptHandler.ts  # Transcript ingestion
│   │   └── observability/
│   │       └── tracer.ts             # Updated with "voice" kind
│   ├── routes.ts                     # Wired WebSocket setup
│   └── storage.ts                    # Added voice methods
├── client/
│   └── src/
│       └── pages/
│           └── voice.tsx             # Frontend voice page
├── shared/
│   └── schema.ts                     # Added voice tables + enums
└── script/
    └── voice_sim.ts                  # Test simulation script
```

## Next Steps

1. **Run migrations:** `npm run db:push`
2. **Start server:** `npm run dev`
3. **Start worker:** `npm run worker` (separate terminal)
4. **Test:** 
   - Open `/voice` page in browser, OR
   - Run `tsx script/voice_sim.ts`
5. **Verify:** Run SQL queries above to confirm data persistence

## Known Limitations (MVP)

1. **Auth:** UserId extraction simplified (uses query param/header)
2. **TTS:** Simulated with text streaming (no actual TTS)
3. **STT:** Simulated with text input (no actual speech-to-text)
4. **Fast-path:** Only 2 intents (schedule, support ticket)
5. **Charts:** Observability dashboard has basic metrics only (no charts yet)

All core functionality is implemented and wired end-to-end. The system is ready for testing and can be extended with real TTS/STT integration.


