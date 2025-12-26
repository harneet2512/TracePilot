import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, index, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table with role-based access
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  auditEvents: many(auditEvents),
  approvals: many(approvals),
}));

// Sessions for authentication
export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  index("sessions_token_idx").on(table.token),
  index("sessions_user_id_idx").on(table.userId),
]);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// Connectors for external services (Jira, Slack, Confluence)
export const connectors = pgTable("connectors", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  type: text("type", { enum: ["jira", "slack", "confluence"] }).notNull(),
  name: text("name").notNull(),
  configJson: text("config_json").notNull(),
  status: text("status", { enum: ["connected", "disconnected", "error"] }).notNull().default("disconnected"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User connector accounts for per-user OAuth tokens
export const userConnectorAccounts = pgTable("user_connector_accounts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["google", "atlassian", "slack"] }).notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  scopesJson: jsonb("scopes_json"),
  externalAccountId: text("external_account_id"),
  metadataJson: jsonb("metadata_json"),
  status: text("status", { enum: ["connected", "expired", "error"] }).notNull().default("connected"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("user_connector_accounts_user_id_idx").on(table.userId),
  index("user_connector_accounts_type_idx").on(table.type),
]);

// User connector scopes for what to index
export const userConnectorScopes = pgTable("user_connector_scopes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id", { length: 36 }).notNull().references(() => userConnectorAccounts.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["google", "atlassian", "slack"] }).notNull(),
  scopeConfigJson: jsonb("scope_config_json").notNull(),
  syncMode: text("sync_mode", { enum: ["metadata_first", "full", "smart", "on_demand"] }).notNull().default("metadata_first"),
  contentStrategy: text("content_strategy", { enum: ["smart", "full", "on_demand"] }).notNull().default("smart"),
  exclusionsJson: jsonb("exclusions_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("user_connector_scopes_account_id_idx").on(table.accountId),
  index("user_connector_scopes_user_id_idx").on(table.userId),
]);

export const userConnectorScopesRelations = relations(userConnectorScopes, ({ one }) => ({
  account: one(userConnectorAccounts, { fields: [userConnectorScopes.accountId], references: [userConnectorAccounts.id] }),
  user: one(users, { fields: [userConnectorScopes.userId], references: [users.id] }),
}));

export const userConnectorAccountsRelations = relations(userConnectorAccounts, ({ one, many }) => ({
  user: one(users, { fields: [userConnectorAccounts.userId], references: [users.id] }),
  scopes: many(userConnectorScopes),
}));

// ============================================================================
// JOB RUNNER SYSTEM
// ============================================================================

// Jobs table - represents a schedulable/runnable task
export const jobs = pgTable("jobs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["sync", "ingest", "eval", "playbook"] }).notNull(),
  connectorType: text("connector_type", { enum: ["google", "atlassian", "slack", "upload"] }),
  scopeId: varchar("scope_id", { length: 36 }),
  status: text("status", { enum: ["pending", "running", "completed", "failed", "dead_letter"] }).notNull().default("pending"),
  priority: integer("priority").notNull().default(0),
  idempotencyKey: text("idempotency_key"),
  inputJson: jsonb("input_json"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextRunAt: timestamp("next_run_at").defaultNow().notNull(),
  lockedAt: timestamp("locked_at"),
  lockedBy: text("locked_by"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("jobs_status_next_run_idx").on(table.status, table.nextRunAt),
  index("jobs_user_id_idx").on(table.userId),
  index("jobs_type_idx").on(table.type),
  index("jobs_idempotency_key_idx").on(table.idempotencyKey),
  index("jobs_connector_type_idx").on(table.connectorType),
]);

// Job runs - individual execution attempts
export const jobRuns = pgTable("job_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id", { length: 36 }).notNull().references(() => jobs.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  error: text("error"),
  errorCode: text("error_code"),
  statsJson: jsonb("stats_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("job_runs_job_id_idx").on(table.jobId),
  index("job_runs_status_idx").on(table.status),
]);

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  user: one(users, { fields: [jobs.userId], references: [users.id] }),
  runs: many(jobRuns),
}));

export const jobRunsRelations = relations(jobRuns, ({ one }) => ({
  job: one(jobs, { fields: [jobRuns.jobId], references: [jobs.id] }),
}));

// ============================================================================
// SOURCE VERSIONING
// ============================================================================

// Sources - identity of a document (stable across versions)
export const sources = pgTable("sources", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["upload", "confluence", "drive", "jira", "slack"] }).notNull(),
  externalId: varchar("external_id", { length: 255 }),
  title: text("title").notNull(),
  url: text("url"),
  contentHash: text("content_hash").notNull(),
  fullText: text("full_text"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("sources_user_id_idx").on(table.userId),
  index("sources_external_id_user_idx").on(table.externalId, table.userId),
  index("sources_type_idx").on(table.type),
  index("sources_content_hash_idx").on(table.contentHash),
]);

// Source versions - immutable snapshots of document content
export const sourceVersions = pgTable("source_versions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id", { length: 36 }).notNull().references(() => sources.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  contentHash: text("content_hash").notNull(),
  fullText: text("full_text"),
  isActive: boolean("is_active").notNull().default(true),
  charCount: integer("char_count"),
  tokenEstimate: integer("token_estimate"),
  ingestedAt: timestamp("ingested_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("source_versions_source_id_idx").on(table.sourceId),
  index("source_versions_content_hash_idx").on(table.contentHash),
  index("source_versions_is_active_idx").on(table.isActive),
]);

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  user: one(users, { fields: [sources.userId], references: [users.id] }),
  versions: many(sourceVersions),
}));

export const sourceVersionsRelations = relations(sourceVersions, ({ one, many }) => ({
  source: one(sources, { fields: [sourceVersions.sourceId], references: [sources.id] }),
  chunks: many(chunks),
}));

// Chunks - now linked to sourceVersions (not directly to sources)
export const chunks = pgTable("chunks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  sourceId: varchar("source_id", { length: 36 }).notNull().references(() => sources.id, { onDelete: "cascade" }),
  sourceVersionId: varchar("source_version_id", { length: 36 }).references(() => sourceVersions.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  charStart: integer("char_start"),
  charEnd: integer("char_end"),
  tokenEstimate: integer("token_estimate"),
  vectorRef: text("vector_ref"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chunks_source_id_idx").on(table.sourceId),
  index("chunks_source_version_id_idx").on(table.sourceVersionId),
  index("chunks_vector_ref_idx").on(table.vectorRef),
  index("chunks_user_id_idx").on(table.userId),
]);

export const chunksRelations = relations(chunks, ({ one }) => ({
  user: one(users, { fields: [chunks.userId], references: [users.id] }),
  source: one(sources, { fields: [chunks.sourceId], references: [sources.id] }),
  sourceVersion: one(sourceVersions, { fields: [chunks.sourceVersionId], references: [sourceVersions.id] }),
}));

// ============================================================================
// OBSERVABILITY: TRACES & SPANS
// ============================================================================

// Traces - top-level request traces
export const traces = pgTable("traces", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  requestId: varchar("request_id", { length: 36 }).notNull(),
  kind: text("kind", { enum: ["chat", "action", "sync", "eval", "playbook"] }).notNull(),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("traces_user_id_idx").on(table.userId),
  index("traces_request_id_idx").on(table.requestId),
  index("traces_kind_idx").on(table.kind),
  index("traces_created_at_idx").on(table.createdAt),
  index("traces_status_idx").on(table.status),
]);

// Spans - individual operations within a trace
export const spans = pgTable("spans", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id", { length: 36 }).notNull().references(() => traces.id, { onDelete: "cascade" }),
  parentSpanId: varchar("parent_span_id", { length: 36 }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["embed", "retrieve", "llm", "tool", "chunk", "validate", "other"] }).notNull(),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  model: text("model"),
  retrievalCount: integer("retrieval_count"),
  similarityMin: real("similarity_min"),
  similarityMax: real("similarity_max"),
  similarityAvg: real("similarity_avg"),
  error: text("error"),
  errorCode: text("error_code"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("spans_trace_id_idx").on(table.traceId),
  index("spans_kind_idx").on(table.kind),
  index("spans_parent_span_id_idx").on(table.parentSpanId),
]);

export const tracesRelations = relations(traces, ({ one, many }) => ({
  user: one(users, { fields: [traces.userId], references: [users.id] }),
  spans: many(spans),
}));

export const spansRelations = relations(spans, ({ one }) => ({
  trace: one(traces, { fields: [spans.traceId], references: [traces.id] }),
}));

// ============================================================================
// POLICIES
// ============================================================================

export const policies = pgTable("policies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  yamlText: text("yaml_text").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// AUDIT EVENTS
// ============================================================================

export const auditEvents = pgTable("audit_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id", { length: 36 }).notNull(),
  traceId: varchar("trace_id", { length: 36 }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  role: text("role"),
  kind: text("kind", { enum: ["chat", "action_execute", "eval", "replay", "sync", "playbook"] }).notNull(),
  prompt: text("prompt"),
  retrievedJson: jsonb("retrieved_json"),
  responseJson: jsonb("response_json"),
  toolProposalsJson: jsonb("tool_proposals_json"),
  toolExecutionsJson: jsonb("tool_executions_json"),
  policyJson: jsonb("policy_json"),
  approvalJson: jsonb("approval_json"),
  success: boolean("success"),
  error: text("error"),
  latencyMs: jsonb("latency_ms"),
  replayOf: varchar("replay_of", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("audit_events_user_id_idx").on(table.userId),
  index("audit_events_request_id_idx").on(table.requestId),
  index("audit_events_trace_id_idx").on(table.traceId),
  index("audit_events_kind_idx").on(table.kind),
  index("audit_events_created_at_idx").on(table.createdAt),
]);

export const auditEventsRelations = relations(auditEvents, ({ one, many }) => ({
  user: one(users, { fields: [auditEvents.userId], references: [users.id] }),
  approvals: many(approvals),
}));

// ============================================================================
// APPROVALS
// ============================================================================

export const approvals = pgTable("approvals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  auditEventId: varchar("audit_event_id", { length: 36 }).notNull().references(() => auditEvents.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  toolName: text("tool_name").notNull(),
  draftJson: jsonb("draft_json").notNull(),
  finalJson: jsonb("final_json"),
  idempotencyKey: text("idempotency_key"),
  status: text("status", { enum: ["pending", "approved", "rejected", "executed", "failed"] }).notNull().default("pending"),
  result: jsonb("result"),
  approvedAt: timestamp("approved_at"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("approvals_audit_event_id_idx").on(table.auditEventId),
  index("approvals_idempotency_key_idx").on(table.idempotencyKey),
  index("approvals_user_id_idx").on(table.userId),
  index("approvals_status_idx").on(table.status),
]);

export const approvalsRelations = relations(approvals, ({ one }) => ({
  auditEvent: one(auditEvents, { fields: [approvals.auditEventId], references: [auditEvents.id] }),
  user: one(users, { fields: [approvals.userId], references: [users.id] }),
}));

// ============================================================================
// EVALUATION SYSTEM (Enhanced)
// ============================================================================

// Evaluation suites - container for test cases
export const evalSuites = pgTable("eval_suites", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  jsonText: text("json_text"),
  isBaseline: boolean("is_baseline").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Evaluation cases - individual test cases
export const evalCases = pgTable("eval_cases", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  suiteId: varchar("suite_id", { length: 36 }).notNull().references(() => evalSuites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["QNA", "ACTION", "AGENTIC"] }).notNull(),
  prompt: text("prompt").notNull(),
  expectedJson: jsonb("expected_json").notNull(),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("eval_cases_suite_id_idx").on(table.suiteId),
  index("eval_cases_type_idx").on(table.type),
]);

// Evaluation runs - execution of a suite
export const evalRuns = pgTable("eval_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  suiteId: varchar("suite_id", { length: 36 }).notNull().references(() => evalSuites.id),
  baselineRunId: varchar("baseline_run_id", { length: 36 }),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  metricsJson: jsonb("metrics_json"),
  resultsJson: jsonb("results_json"),
  regressionJson: jsonb("regression_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("eval_runs_suite_id_idx").on(table.suiteId),
  index("eval_runs_status_idx").on(table.status),
]);

// Evaluation results - per-case results within a run
export const evalResults = pgTable("eval_results", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id", { length: 36 }).notNull().references(() => evalRuns.id, { onDelete: "cascade" }),
  caseId: varchar("case_id", { length: 36 }).notNull().references(() => evalCases.id),
  status: text("status", { enum: ["passed", "failed", "error"] }).notNull(),
  actualJson: jsonb("actual_json"),
  scoresJson: jsonb("scores_json"),
  latencyMs: integer("latency_ms"),
  tokenUsage: integer("token_usage"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("eval_results_run_id_idx").on(table.runId),
  index("eval_results_case_id_idx").on(table.caseId),
  index("eval_results_status_idx").on(table.status),
]);

export const evalSuitesRelations = relations(evalSuites, ({ many }) => ({
  cases: many(evalCases),
  runs: many(evalRuns),
}));

export const evalCasesRelations = relations(evalCases, ({ one, many }) => ({
  suite: one(evalSuites, { fields: [evalCases.suiteId], references: [evalSuites.id] }),
  results: many(evalResults),
}));

export const evalRunsRelations = relations(evalRuns, ({ one, many }) => ({
  suite: one(evalSuites, { fields: [evalRuns.suiteId], references: [evalSuites.id] }),
  results: many(evalResults),
}));

export const evalResultsRelations = relations(evalResults, ({ one }) => ({
  run: one(evalRuns, { fields: [evalResults.runId], references: [evalRuns.id] }),
  case: one(evalCases, { fields: [evalResults.caseId], references: [evalCases.id] }),
}));

// ============================================================================
// PLAYBOOKS
// ============================================================================

// Playbooks - incident response plans
export const playbooks = pgTable("playbooks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  incidentText: text("incident_text").notNull(),
  status: text("status", { enum: ["draft", "active", "completed", "archived"] }).notNull().default("draft"),
  traceId: varchar("trace_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("playbooks_user_id_idx").on(table.userId),
  index("playbooks_status_idx").on(table.status),
]);

// Playbook items - individual steps in a playbook
export const playbookItems = pgTable("playbook_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  playbookId: varchar("playbook_id", { length: 36 }).notNull().references(() => playbooks.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull(),
  kind: text("kind", { enum: ["sop_step", "checklist", "action_draft", "ppe", "shutdown"] }).notNull(),
  title: text("title").notNull(),
  content: text("content"),
  dataJson: jsonb("data_json"),
  citationsJson: jsonb("citations_json"),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("playbook_items_playbook_id_idx").on(table.playbookId),
  index("playbook_items_kind_idx").on(table.kind),
]);

export const playbooksRelations = relations(playbooks, ({ one, many }) => ({
  user: one(users, { fields: [playbooks.userId], references: [users.id] }),
  items: many(playbookItems),
}));

export const playbookItemsRelations = relations(playbookItems, ({ one }) => ({
  playbook: one(playbooks, { fields: [playbookItems.playbookId], references: [playbooks.id] }),
}));

// ============================================================================
// INSERT SCHEMAS
// ============================================================================

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export const insertConnectorSchema = createInsertSchema(connectors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserConnectorAccountSchema = createInsertSchema(userConnectorAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserConnectorScopeSchema = createInsertSchema(userConnectorScopes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSourceSchema = createInsertSchema(sources).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSourceVersionSchema = createInsertSchema(sourceVersions).omit({ id: true, createdAt: true });
export const insertChunkSchema = createInsertSchema(chunks).omit({ id: true, createdAt: true });
export const insertPolicySchema = createInsertSchema(policies).omit({ id: true, createdAt: true });
export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({ id: true, createdAt: true });
export const insertApprovalSchema = createInsertSchema(approvals).omit({ id: true, createdAt: true });
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobRunSchema = createInsertSchema(jobRuns).omit({ id: true, createdAt: true });
export const insertTraceSchema = createInsertSchema(traces).omit({ id: true, createdAt: true });
export const insertSpanSchema = createInsertSchema(spans).omit({ id: true, createdAt: true });
export const insertEvalSuiteSchema = createInsertSchema(evalSuites).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEvalCaseSchema = createInsertSchema(evalCases).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEvalRunSchema = createInsertSchema(evalRuns).omit({ id: true, createdAt: true });
export const insertEvalResultSchema = createInsertSchema(evalResults).omit({ id: true, createdAt: true });
export const insertPlaybookSchema = createInsertSchema(playbooks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlaybookItemSchema = createInsertSchema(playbookItems).omit({ id: true, createdAt: true });

// ============================================================================
// TYPES
// ============================================================================

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Connector = typeof connectors.$inferSelect;
export type InsertConnector = z.infer<typeof insertConnectorSchema>;
export type UserConnectorAccount = typeof userConnectorAccounts.$inferSelect;
export type InsertUserConnectorAccount = z.infer<typeof insertUserConnectorAccountSchema>;
export type UserConnectorScope = typeof userConnectorScopes.$inferSelect;
export type InsertUserConnectorScope = z.infer<typeof insertUserConnectorScopeSchema>;
export type Source = typeof sources.$inferSelect;
export type InsertSource = z.infer<typeof insertSourceSchema>;
export type SourceVersion = typeof sourceVersions.$inferSelect;
export type InsertSourceVersion = z.infer<typeof insertSourceVersionSchema>;
export type Chunk = typeof chunks.$inferSelect;
export type InsertChunk = z.infer<typeof insertChunkSchema>;
export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type Approval = typeof approvals.$inferSelect;
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type JobRun = typeof jobRuns.$inferSelect;
export type InsertJobRun = z.infer<typeof insertJobRunSchema>;
export type Trace = typeof traces.$inferSelect;
export type InsertTrace = z.infer<typeof insertTraceSchema>;
export type Span = typeof spans.$inferSelect;
export type InsertSpan = z.infer<typeof insertSpanSchema>;
export type EvalSuite = typeof evalSuites.$inferSelect;
export type InsertEvalSuite = z.infer<typeof insertEvalSuiteSchema>;
export type EvalCase = typeof evalCases.$inferSelect;
export type InsertEvalCase = z.infer<typeof insertEvalCaseSchema>;
export type EvalRun = typeof evalRuns.$inferSelect;
export type InsertEvalRun = z.infer<typeof insertEvalRunSchema>;
export type EvalResult = typeof evalResults.$inferSelect;
export type InsertEvalResult = z.infer<typeof insertEvalResultSchema>;
export type Playbook = typeof playbooks.$inferSelect;
export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;
export type PlaybookItem = typeof playbookItems.$inferSelect;
export type InsertPlaybookItem = z.infer<typeof insertPlaybookItemSchema>;

// ============================================================================
// VALIDATION SCHEMAS (for AI responses)
// ============================================================================

export const citationSchema = z.object({
  sourceId: z.string(),
  sourceVersionId: z.string().optional(),
  chunkId: z.string(),
  charStart: z.number().optional(),
  charEnd: z.number().optional(),
});

export const bulletSchema = z.object({
  claim: z.string(),
  citations: z.array(citationSchema),
});

export const actionSchema = z.object({
  type: z.enum(["jira.create_issue", "jira.update_issue", "slack.post_message", "confluence.upsert_page"]),
  draft: z.record(z.any()),
  rationale: z.string(),
  citations: z.array(citationSchema),
});

export const chatResponseSchema = z.object({
  answer: z.string(),
  bullets: z.array(bulletSchema),
  action: actionSchema.nullable(),
  needsClarification: z.boolean(),
  clarifyingQuestions: z.array(z.string()),
});

export type Citation = z.infer<typeof citationSchema>;
export type Bullet = z.infer<typeof bulletSchema>;
export type Action = z.infer<typeof actionSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;

// Playbook response schema
export const playbookStepSchema = z.object({
  kind: z.enum(["sop_step", "checklist", "action_draft", "ppe", "shutdown"]),
  title: z.string(),
  content: z.string().optional(),
  citations: z.array(citationSchema),
  data: z.record(z.any()).optional(),
});

export const playbookResponseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  steps: z.array(playbookStepSchema),
  actionDrafts: z.array(actionSchema),
});

export type PlaybookStep = z.infer<typeof playbookStepSchema>;
export type PlaybookResponse = z.infer<typeof playbookResponseSchema>;

// Policy schema
export const policyYamlSchema = z.object({
  roles: z.record(z.object({
    tools: z.array(z.string()),
  })),
  toolConstraints: z.record(z.object({
    allowedProjects: z.array(z.string()).optional(),
    allowedChannels: z.array(z.string()).optional(),
    allowedSpaces: z.array(z.string()).optional(),
    requireApproval: z.boolean().optional(),
  })).optional(),
});

export type PolicyYaml = z.infer<typeof policyYamlSchema>;

// Eval expected schemas
export const evalExpectedQnaSchema = z.object({
  mustCite: z.boolean().optional(),
  expectedSourceIds: z.array(z.string()).optional(),
  mustContain: z.array(z.string()).optional(),
  mustNotContain: z.array(z.string()).optional(),
});

export const evalExpectedActionSchema = z.object({
  expectedTool: z.string(),
  requiredParams: z.record(z.any()).optional(),
  policyMustAllow: z.boolean().optional(),
});

export const evalExpectedAgenticSchema = z.object({
  taskMustSucceed: z.boolean(),
  maxSteps: z.number().optional(),
  maxCost: z.number().optional(),
});

export type EvalExpectedQna = z.infer<typeof evalExpectedQnaSchema>;
export type EvalExpectedAction = z.infer<typeof evalExpectedActionSchema>;
export type EvalExpectedAgentic = z.infer<typeof evalExpectedAgenticSchema>;

// Metrics schema
export const evalMetricsSchema = z.object({
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  errors: z.number(),
  passRate: z.number(),
  recallAtK: z.number().optional(),
  citationIntegrity: z.number().optional(),
  unsupportedClaimRate: z.number().optional(),
  toolSelectionAccuracy: z.number().optional(),
  parameterCorrectness: z.number().optional(),
  policyComplianceRate: z.number().optional(),
  firstCallSuccessRate: z.number().optional(),
  taskSuccessRate: z.number().optional(),
  avgStepsToSuccess: z.number().optional(),
  loopRate: z.number().optional(),
  avgCostPerSuccess: z.number().optional(),
  totalTokens: z.number().optional(),
  totalLatencyMs: z.number().optional(),
});

export type EvalMetrics = z.infer<typeof evalMetricsSchema>;

// Regression schema
export const regressionDiffSchema = z.object({
  metric: z.string(),
  baseline: z.number(),
  current: z.number(),
  delta: z.number(),
  deltaPercent: z.number(),
  isRegression: z.boolean(),
  threshold: z.number().optional(),
});

export type RegressionDiff = z.infer<typeof regressionDiffSchema>;

// Legacy eval schema (for backwards compatibility)
export const evalCaseJsonSchema = z.object({
  id: z.string(),
  type: z.enum(["QNA", "ACTION"]),
  prompt: z.string(),
  mustCite: z.boolean().optional(),
  expectedSourceIds: z.array(z.string()).optional(),
  expectedTool: z.string().optional(),
  requiredFields: z.array(z.string()).optional(),
});

export const evalSuiteJsonSchema = z.object({
  name: z.string(),
  cases: z.array(evalCaseJsonSchema),
});

export type EvalCaseJson = z.infer<typeof evalCaseJsonSchema>;
export type EvalSuiteJson = z.infer<typeof evalSuiteJsonSchema>;
