# Phase 0 - Discovery Report

## Component Locations

### 1. Server Entrypoint (HTTP Server Creation)
- **File:** `Field-Copilot-1/server/index.ts`
- **Line:** 11
- **Function:** `const httpServer = createServer(app);`
- **Usage:** HTTP server is created here and passed to `registerRoutes(httpServer, app)` at line 69
- **Note:** WebSocket server should be attached to this `httpServer` instance

### 2. Express Route Registration
- **File:** `Field-Copilot-1/server/routes.ts`
- **Line:** 109
- **Function:** `export async function registerRoutes(httpServer: Server, app: Express): Promise<Server>`
- **Usage:** All Express routes are registered here, including `/api/chat`

### 3. Chat Endpoint Handler
- **File:** `Field-Copilot-1/server/routes.ts`
- **Line:** 410
- **Function:** `app.post("/api/chat", authMiddleware, chatLimiter, async (req, res) => { ... })`
- **Key Operations:**
  - Starts trace: `tracer.startTrace("chat", req.user!.id, req.requestId)` (line 422)
  - Retrieval: `storage.getActiveChunks()` → `searchSimilar(message, allChunks, 5)` (lines 426, 432)
  - LLM: `chatCompletion(messages)` (line 509)
  - Validation: `validateWithRepair(responseText, chatResponseSchema, 2)` (line 525)
  - Citation enrichment: `enrichCitations()` (line 531)

### 4. Job Runner Poll Loop
- **File:** `Field-Copilot-1/server/lib/jobs/runner.ts`
- **Line:** 93
- **Function:** `private async poll()`
- **Key Operations:**
  - Calls `storage.claimJobWithLock(this.workerId, 1)` at line 99
  - Polls every `POLL_INTERVAL_MS` (5000ms) at line 109

### 5. Job Claiming Query (SKIP LOCKED)
- **File:** `Field-Copilot-1/server/storage.ts`
- **Line:** 779
- **Function:** `async claimJobWithLock(workerId: string, limit = 1): Promise<Job | undefined>`
- **Key Query:** Lines 785-793
  ```sql
  SELECT * FROM jobs 
  WHERE status = 'pending' 
  AND next_run_at <= $1 
  AND locked_at IS NULL
  ORDER BY priority DESC, next_run_at ASC
  LIMIT $2
  FOR UPDATE SKIP LOCKED
  ```
- **Transaction:** Uses `BEGIN`/`COMMIT`/`ROLLBACK` with pg pool client

### 6. Ingestion Handler (Hashing/Versioning/Chunk/Embed/Upsert)
- **File:** `Field-Copilot-1/server/lib/jobs/handlers/ingestHandler.ts`
- **Line:** 29
- **Function:** `export function registerIngestHandler()`
- **Key Operations:**
  - Content hash: `createHash("sha256").update(file.content).digest("hex")` (line 68)
  - Source versioning: `storage.deactivateSourceVersions()` → `storage.createSourceVersion()` (lines 92, 105-115)
  - Chunking: `chunkText(file.content)` (line 195)
  - Embedding: `indexChunks(chunkRecords)` (line 218)
  - Stats: Updates `jobRuns.statsJson` with `{discovered, processed, skipped, failed, durationMs}` (lines 230-245)

### 7. Retrieval/Vector Search Function
- **File:** `Field-Copilot-1/server/lib/vectorstore.ts`
- **Line:** 43
- **Function:** `export async function searchSimilar(query: string, allChunks: Chunk[], topK: number = 5)`
- **Key Operations:**
  - Creates query embedding: `await createEmbedding(query)` (line 50)
  - Cosine similarity: `cosineSimilarity(queryEmbedding, embedding)` (line 57)
  - Returns: `Promise<{ chunk: Chunk; score: number }[]>`
- **Usage:** Called from `server/routes.ts:432` with `searchSimilar(message, allChunks, 5)`

### 8. Citations Production
- **File:** `Field-Copilot-1/server/routes.ts`
- **Line:** 531
- **Function:** `enrichCitations()` (inline function)
- **Key Operations:**
  - Enriches citations with `sourceVersionId`, `charStart`, `charEnd` from retrieved chunks
  - Maps over `citation.chunkId` to find matching chunk info
  - Applied to `chatResponse.bullets` and `chatResponse.action.citations` (lines 547, 554)

### 9. JSON Schema Validation + Repair Pass
- **File:** `Field-Copilot-1/server/lib/validation/jsonRepair.ts`
- **Line:** 12
- **Function:** `export async function validateWithRepair<T>(rawJson: string, schema: z.ZodType<T>, maxRetries: number = 2)`
- **Key Operations:**
  - First attempt: `JSON.parse()` + `schema.parse()` (lines 18-26)
  - Repair loop: `attemptRepairWithTimeout()` (lines 43-70)
  - LLM repair: Uses `chatCompletion()` to fix malformed JSON (line 115)
  - Returns: `ValidationResult<T>` with `success`, `data`, `repaired`, `repairAttempts`
- **Usage:** Called from `server/routes.ts:525` with `validateWithRepair(responseText, chatResponseSchema, 2)`

### 10. Policy Check + Approvals Creation
- **File:** `Field-Copilot-1/server/lib/policy/checker.ts`
- **Line:** 22
- **Function:** `export function checkPolicy(policy: PolicyYaml | null, input: PolicyCheckInput): PolicyCheckResult`
- **Key Operations:**
  - Checks role tools whitelist (line 38)
  - Checks tool constraints (allowedProjects, allowedChannels, allowedSpaces) (lines 55-107)
  - Returns: `{allowed, requiresApproval, denialReason, denialDetails}`
- **Approvals Creation:**
  - **File:** `Field-Copilot-1/server/routes.ts`
  - **Line:** 764
  - **Function:** `storage.createApproval()` called after policy check passes
- **Usage:** Called from `server/routes.ts:685` with `checkPolicy(parsedPolicy, {userRole, toolName, toolParams})`

### 11. Tracer/Spans Helper + DB Write Path
- **File:** `Field-Copilot-1/server/lib/observability/tracer.ts`
- **Line:** 28
- **Class:** `class Tracer`
- **Key Methods:**
  - `startTrace(kind, userId, requestId)`: Creates trace in DB via `storage.createTrace()` (line 47)
  - `endTrace(traceId, status, errorMessage)`: Updates trace via `storage.updateTrace()` (line 54)
  - `startSpan(traceId, data, parentSpanId)`: Creates span via `storage.createSpan()` (line 91)
  - `endSpan(spanId, status, updates, error)`: Updates span via `storage.updateSpan()` (line 103)
  - `recordSpan(traceId, data)`: Creates span directly via `storage.createSpan()` (line 129)
- **DB Write Path:**
  - **File:** `Field-Copilot-1/server/storage.ts`
  - **Line:** 693 - `async createSpan(span: InsertSpan): Promise<Span>`
  - **Line:** 698 - `async updateSpan(id: string, updates: Partial<InsertSpan>): Promise<Span | undefined>`
  - Uses Drizzle ORM: `db.insert(spans).values(span).returning()` and `db.update(spans).set(updates).where(eq(spans.id, id))`

### 12. Existing Libraries
- **ws:** Already in `package.json` line 91: `"ws": "^8.18.0"`
- **@types/ws:** Already in `package.json` line 110: `"@types/ws": "^8.5.13"`
- **uuid:** Already in `package.json` line 88: `"uuid": "^13.0.0"`
- **zod:** Already in `package.json` line 93: `"zod": "^3.24.2"` (used for schema validation)

## Summary

All required components are found and accessible. The codebase is well-structured with:
- ✅ HTTP server ready for WebSocket attachment
- ✅ Existing job runner with SKIP LOCKED pattern
- ✅ Source versioning with active chunk filtering
- ✅ Vector search with similarity scoring
- ✅ JSON validation with LLM repair
- ✅ Policy checking with explainable denials
- ✅ Tracing infrastructure with DB persistence
- ✅ All required libraries already installed

Ready to proceed with Phases 1-4 implementation.


