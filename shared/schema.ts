import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, index, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Workspaces table - multi-tenant boundary
export const workspaces = pgTable("workspaces", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  users: many(users),
}));

// Users table with role-based access
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("users_workspace_id_idx").on(table.workspaceId),
]);

export const usersRelations = relations(users, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [users.workspaceId], references: [workspaces.id] }),
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
  workspaceId: varchar("workspace_id", { length: 36 }).notNull().references(() => workspaces.id, { onDelete: "cascade" }),
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
  index("user_connector_accounts_workspace_id_idx").on(table.workspaceId),
  index("user_connector_accounts_user_id_idx").on(table.userId),
  index("user_connector_accounts_type_idx").on(table.type),
]);

// User connector scopes for what to index
export const userConnectorScopes = pgTable("user_connector_scopes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull().references(() => workspaces.id, { onDelete: "cascade" }),
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
  index("user_connector_scopes_workspace_id_idx").on(table.workspaceId),
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

// Job locks - for concurrency control per connector/account
export const jobLocks = pgTable("job_locks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  connectorType: text("connector_type", { enum: ["google", "atlassian", "slack", "upload"] }).notNull(),
  accountId: varchar("account_id", { length: 255 }),
  activeCount: integer("active_count").notNull().default(0),
  maxConcurrency: integer("max_concurrency").notNull().default(2),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("job_locks_connector_type_account_idx").on(table.connectorType, table.accountId),
]);

// Rate limit buckets - token bucket for rate limiting
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id", { length: 255 }).notNull(),
  connectorType: text("connector_type", { enum: ["google", "atlassian", "slack", "upload"] }).notNull(),
  tokens: integer("tokens").notNull().default(10),
  maxTokens: integer("max_tokens").notNull().default(10),
  refillRate: integer("refill_rate").notNull().default(1),
  lastRefill: timestamp("last_refill").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("rate_limit_buckets_account_connector_idx").on(table.accountId, table.connectorType),
]);

// Jobs table - represents a schedulable/runnable task
export const jobs = pgTable("jobs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id", { length: 36 }).references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["sync", "ingest", "eval", "playbook", "ingest_call_transcript", "score_reply"] }).notNull(),
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
  index("jobs_workspace_id_idx").on(table.workspaceId),
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
  workspaceId: varchar("workspace_id", { length: 36 }).notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).notNull().references(() => users.id),
  type: text("type", { enum: ["upload", "confluence", "drive", "jira", "slack", "voice_call"] }).notNull(),
  visibility: text("visibility", { enum: ["private", "workspace"] }).notNull().default("private"),
  externalId: varchar("external_id", { length: 255 }),
  title: text("title").notNull(),
  url: text("url"),
  contentHash: text("content_hash").notNull(),
  fullText: text("full_text"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("sources_workspace_id_idx").on(table.workspaceId),
  index("sources_user_id_idx").on(table.userId),
  index("sources_created_by_user_id_idx").on(table.createdByUserId),
  index("sources_visibility_idx").on(table.visibility),
  index("sources_external_id_user_idx").on(table.externalId, table.userId),
  index("sources_type_idx").on(table.type),
  index("sources_content_hash_idx").on(table.contentHash),
]);

// Source versions - immutable snapshots of document content
export const sourceVersions = pgTable("source_versions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull().references(() => workspaces.id, { onDelete: "cascade" }),
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
  index("source_versions_workspace_id_idx").on(table.workspaceId),
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
  workspaceId: varchar("workspace_id", { length: 36 }).notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  sourceId: varchar("source_id", { length: 36 }).notNull().references(() => sources.id, { onDelete: "cascade" }),
  sourceVersionId: varchar("source_version_id", { length: 36 }).references(() => sourceVersions.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  charStart: integer("char_start"),
  charEnd: integer("char_end"),
  tokenEstimate: integer("token_estimate"),
  metadataJson: jsonb("metadata_json"),
  vectorRef: text("vector_ref"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chunks_workspace_id_idx").on(table.workspaceId),
  index("chunks_source_id_idx").on(table.sourceId),
  index("chunks_source_version_id_idx").on(table.sourceVersionId),
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
  workspaceId: varchar("workspace_id", { length: 36 }).references(() => workspaces.id),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  requestId: text("request_id").notNull(),
  kind: text("kind", { enum: ["chat", "action", "sync", "eval", "playbook", "voice"] }).notNull(),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("traces_workspace_id_idx").on(table.workspaceId),
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
  workspaceId: varchar("workspace_id", { length: 36 }).references(() => workspaces.id),
  requestId: text("request_id").notNull(),
  traceId: varchar("trace_id", { length: 36 }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  role: text("role"),
  kind: text("kind", { enum: ["chat", "action_execute", "eval", "replay", "sync", "playbook", "slack_private_channel_skipped", "decision_to_jira"] }).notNull(),
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
  index("audit_events_workspace_id_idx").on(table.workspaceId),
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
  workspaceId: varchar("workspace_id", { length: 36 }).references(() => workspaces.id),
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
  index("approvals_workspace_id_idx").on(table.workspaceId),
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
  workspaceId: varchar("workspace_id", { length: 36 }).references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  jsonText: text("json_text"),
  isBaseline: boolean("is_baseline").notNull().default(false),
  baselineRunId: varchar("baseline_run_id", { length: 36 }),
  thresholdsJson: jsonb("thresholds_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("eval_suites_workspace_id_idx").on(table.workspaceId),
]);

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
  workspaceId: varchar("workspace_id", { length: 36 }).references(() => workspaces.id, { onDelete: "cascade" }),
  suiteId: varchar("suite_id", { length: 36 }).notNull().references(() => evalSuites.id),
  baselineRunId: varchar("baseline_run_id", { length: 36 }),
  gitSha: varchar("git_sha", { length: 80 }),
  env: text("env"),
  model: text("model"),
  status: text("status", { enum: ["running", "completed", "failed"] }).notNull().default("running"),
  channel: text("channel", { enum: ["http", "voice", "mcp"] }).notNull().default("http"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  summaryJson: jsonb("summary_json"),
  metricsJson: jsonb("metrics_json"),
  resultsJson: jsonb("results_json"),
  regressionJson: jsonb("regression_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("eval_runs_workspace_id_idx").on(table.workspaceId),
  index("eval_runs_suite_id_idx").on(table.suiteId),
  index("eval_runs_suite_created_idx").on(table.suiteId, table.createdAt),
  index("eval_runs_status_idx").on(table.status),
  index("eval_runs_channel_idx").on(table.channel),
]);

// Evaluation results - per-case results within a run
export const evalResults = pgTable("eval_results", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id", { length: 36 }).references(() => workspaces.id, { onDelete: "cascade" }),
  runId: varchar("run_id", { length: 36 }).notNull().references(() => evalRuns.id, { onDelete: "cascade" }),
  caseId: varchar("case_id", { length: 36 }).notNull().references(() => evalCases.id),
  status: text("status", { enum: ["passed", "failed", "error"] }).notNull(),
  actualJson: jsonb("actual_json"),
  scoresJson: jsonb("scores_json"),
  artifactsJson: jsonb("artifacts_json"),
  latencyMs: integer("latency_ms"),
  tokenUsage: integer("token_usage"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("eval_results_workspace_id_idx").on(table.workspaceId),
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
// VOICE AGENT
// ============================================================================

// Voice calls - tracks active and completed voice sessions
export const voiceCalls = pgTable("voice_calls", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["active", "completed"] }).notNull().default("active"),
  callerNumber: text("caller_number"),
  metadataJson: jsonb("metadata_json"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("voice_calls_user_id_idx").on(table.userId),
  index("voice_calls_status_idx").on(table.status),
]);

// Voice turns - individual messages in a voice call
export const voiceTurns = pgTable("voice_turns", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  callId: varchar("call_id", { length: 36 }).notNull().references(() => voiceCalls.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  text: text("text").notNull(),
  traceId: varchar("trace_id", { length: 36 }),
  turnJson: jsonb("turn_json"), // Optional timings and metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("voice_turns_call_id_idx").on(table.callId),
  index("voice_turns_trace_id_idx").on(table.traceId),
]);

export const voiceCallsRelations = relations(voiceCalls, ({ one, many }) => ({
  user: one(users, { fields: [voiceCalls.userId], references: [users.id] }),
  turns: many(voiceTurns),
}));

export const voiceTurnsRelations = relations(voiceTurns, ({ one }) => ({
  call: one(voiceCalls, { fields: [voiceTurns.callId], references: [voiceCalls.id] }),
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
export const insertJobLockSchema = createInsertSchema(jobLocks).omit({ id: true });
export const insertRateLimitBucketSchema = createInsertSchema(rateLimitBuckets).omit({ id: true });
export const insertTraceSchema = createInsertSchema(traces).omit({ id: true, createdAt: true });
export const insertSpanSchema = createInsertSchema(spans).omit({ id: true, createdAt: true });
export const insertEvalSuiteSchema = createInsertSchema(evalSuites).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEvalCaseSchema = createInsertSchema(evalCases).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEvalRunSchema = createInsertSchema(evalRuns).omit({ id: true, createdAt: true });
export const insertEvalResultSchema = createInsertSchema(evalResults).omit({ id: true, createdAt: true });
export const insertPlaybookSchema = createInsertSchema(playbooks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlaybookItemSchema = createInsertSchema(playbookItems).omit({ id: true, createdAt: true });
export const insertVoiceCallSchema = createInsertSchema(voiceCalls).omit({ id: true, createdAt: true });
export const insertVoiceTurnSchema = createInsertSchema(voiceTurns).omit({ id: true, createdAt: true });

// ============================================================================
// CHAT HISTORY
// ============================================================================

export const conversations = pgTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Chat"),
  summary: text("summary"),
  environment: text("environment", { enum: ["dev", "stage", "prod"] }),
  model: text("model"),
  modelConfigJson: jsonb("model_config_json"),
  retrievalConfigJson: jsonb("retrieval_config_json"),
  entrypoint: text("entrypoint", { enum: ["web", "app", "api", "voice", "mcp"] }),
  appVersion: text("app_version"),
  gitSha: text("git_sha"),
  finalOutcome: text("final_outcome", { enum: ["success", "failure"] }),
  errorClass: text("error_class"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("conversations_user_id_idx").on(table.userId),
  index("conversations_updated_at_idx").on(table.updatedAt),
  index("conversations_environment_idx").on(table.environment),
  index("conversations_model_idx").on(table.model),
  index("conversations_created_at_idx").on(table.createdAt),
]);

export const messages = pgTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  toolCallId: text("tool_call_id"),
  citationsJson: jsonb("citations_json"), // For assistant messages
  metadataJson: jsonb("metadata_json"), // For timing/debug
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("messages_conversation_id_idx").on(table.conversationId),
  index("messages_created_at_idx").on(table.createdAt),
]);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const chatReplies = pgTable("chat_replies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  chatId: varchar("chat_id", { length: 36 }).notNull().references(() => conversations.id, { onDelete: "cascade" }),
  messageId: varchar("message_id", { length: 36 }).notNull().references(() => messages.id, { onDelete: "cascade" }),
  latencyMs: integer("latency_ms"),
  ttftMs: integer("ttft_ms"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  costUsd: real("cost_usd"),
  status: text("status", { enum: ["ok", "error"] }).notNull().default("ok"),
  errorType: text("error_type"),
  traceId: varchar("trace_id", { length: 36 }),
  streamed: boolean("streamed").notNull().default(true),
  scored: boolean("scored").notNull().default(false),
  scoredAt: timestamp("scored_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chat_replies_chat_id_idx").on(table.chatId),
  index("chat_replies_message_id_idx").on(table.messageId),
  index("chat_replies_trace_id_idx").on(table.traceId),
  index("chat_replies_created_at_idx").on(table.createdAt),
  index("chat_replies_status_idx").on(table.status),
]);

export const replyRetrievalArtifacts = pgTable("reply_retrieval_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  replyId: varchar("reply_id", { length: 36 }).notNull().references(() => chatReplies.id, { onDelete: "cascade" }),
  retrievalMode: text("retrieval_mode"),
  topK: integer("top_k"),
  chunksReturnedCount: integer("chunks_returned_count"),
  sourcesReturnedCount: integer("sources_returned_count"),
  topSimilarity: real("top_similarity"),
  retrievalLatencyMs: integer("retrieval_latency_ms"),
  retrievedChunksJson: jsonb("retrieved_chunks_json"),
  dedupStatsJson: jsonb("dedup_stats_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("reply_retrieval_artifacts_reply_id_idx").on(table.replyId),
]);

export const replyCitationArtifacts = pgTable("reply_citation_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  replyId: varchar("reply_id", { length: 36 }).notNull().references(() => chatReplies.id, { onDelete: "cascade" }),
  citationsJson: jsonb("citations_json"),
  citationCoverageRate: real("citation_coverage_rate"),
  citationIntegrityRate: real("citation_integrity_rate"),
  citationMisattributionRate: real("citation_misattribution_rate"),
  repairApplied: boolean("repair_applied").notNull().default(false),
  repairNotesJson: jsonb("repair_notes_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("reply_citation_artifacts_reply_id_idx").on(table.replyId),
]);

export const replyLlmEvalArtifacts = pgTable("reply_llm_eval_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  replyId: varchar("reply_id", { length: 36 }).notNull().references(() => chatReplies.id, { onDelete: "cascade" }),
  claimsJson: jsonb("claims_json"),
  claimLabelsJson: jsonb("claim_labels_json"),
  groundedClaimRate: real("grounded_claim_rate"),
  unsupportedClaimRate: real("unsupported_claim_rate"),
  contradictionRate: real("contradiction_rate"),
  completenessScore: real("completeness_score"),
  missingPointsJson: jsonb("missing_points_json"),
  answerRelevanceScore: real("answer_relevance_score"),
  contextRelevanceScore: real("context_relevance_score"),
  contextRecallScore: real("context_recall_score"),
  lowEvidenceCalibrationJson: jsonb("low_evidence_calibration_json"),
  formatValidRate: real("format_valid_rate"),
  judgeModel: text("judge_model"),
  judgeVersion: text("judge_version"),
  judgeRationalesJson: jsonb("judge_rationales_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("reply_llm_eval_artifacts_reply_id_idx").on(table.replyId),
]);

export const replyToolArtifacts = pgTable("reply_tool_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  replyId: varchar("reply_id", { length: 36 }).notNull().references(() => chatReplies.id, { onDelete: "cascade" }),
  toolCallsJson: jsonb("tool_calls_json"),
  toolSelectionAccuracy: real("tool_selection_accuracy"),
  parameterCorrectness: real("parameter_correctness"),
  idempotencyKey: text("idempotency_key"),
  duplicateActionDetected: boolean("duplicate_action_detected").notNull().default(false),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("reply_tool_artifacts_reply_id_idx").on(table.replyId),
  index("reply_tool_artifacts_idempotency_key_idx").on(table.idempotencyKey),
]);

export const enterpriseEvalArtifacts = pgTable("enterprise_eval_artifacts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  replyId: varchar("reply_id", { length: 36 }).references(() => chatReplies.id, { onDelete: "cascade" }),
  runId: varchar("run_id", { length: 36 }).references(() => evalRuns.id, { onDelete: "cascade" }),
  evalPackVersion: text("eval_pack_version").notNull().default("v1"),

  evidenceCoverageScore: real("evidence_coverage_score"),
  evidenceCoveragePass: boolean("evidence_coverage_pass"),
  evidenceCoverageRationale: text("evidence_coverage_rationale"),
  evidenceCoverageMapJson: jsonb("evidence_coverage_map_json"),

  evidenceSufficiencyScore: real("evidence_sufficiency_score"),
  evidenceSufficiencyPass: boolean("evidence_sufficiency_pass"),
  evidenceSufficiencyRationale: text("evidence_sufficiency_rationale"),
  evidenceSufficiencyDetailsJson: jsonb("evidence_sufficiency_details_json"),

  multihopTraceScore: real("multihop_trace_score"),
  multihopTracePass: boolean("multihop_trace_pass"),
  multihopTraceRationale: text("multihop_trace_rationale"),
  multihopTraceJson: jsonb("multihop_trace_json"),

  directnessScore: real("directness_score"),
  directnessPass: boolean("directness_pass"),
  directnessRationale: text("directness_rationale"),
  actionabilityScore: real("actionability_score"),
  actionabilityPass: boolean("actionability_pass"),
  actionabilityRationale: text("actionability_rationale"),

  clarityScore: real("clarity_score"),
  clarityPass: boolean("clarity_pass"),
  clarityRationale: text("clarity_rationale"),
  clarityDetailsJson: jsonb("clarity_details_json"),

  followupQualityScore: real("followup_quality_score"),
  followupQualityPass: boolean("followup_quality_pass"),
  followupQualityRationale: text("followup_quality_rationale"),

  sourceScopePass: boolean("source_scope_pass"),
  sourceScopeScore: real("source_scope_score"),
  sourceScopeRationale: text("source_scope_rationale"),
  sourceScopeViolationsJson: jsonb("source_scope_violations_json"),

  missingDataHallucinationPass: boolean("missing_data_hallucination_pass"),
  missingDataHallucinationScore: real("missing_data_hallucination_score"),
  missingDataHallucinationRationale: text("missing_data_hallucination_rationale"),

  piiLeakPass: boolean("pii_leak_pass"),
  piiLeakScore: real("pii_leak_score"),
  piiLeakRationale: text("pii_leak_rationale"),
  piiLeakFindingsJson: jsonb("pii_leak_findings_json"),

  stabilityVariance: real("stability_variance"),
  stabilityPass: boolean("stability_pass"),
  stabilityRationale: text("stability_rationale"),
  stabilityDetailsJson: jsonb("stability_details_json"),

  retrievalDriftScore: real("retrieval_drift_score"),
  retrievalDriftPass: boolean("retrieval_drift_pass"),
  retrievalDriftRationale: text("retrieval_drift_rationale"),
  retrievalDriftJson: jsonb("retrieval_drift_json"),

  citationUiReadinessScore: real("citation_ui_readiness_score"),
  citationUiReadinessPass: boolean("citation_ui_readiness_pass"),
  citationUiReadinessRationale: text("citation_ui_readiness_rationale"),
  citationUiDetailsJson: jsonb("citation_ui_details_json"),

  debugPanelCompletenessScore: real("debug_panel_completeness_score"),
  debugPanelCompletenessPass: boolean("debug_panel_completeness_pass"),
  debugPanelCompletenessRationale: text("debug_panel_completeness_rationale"),
  debugPanelMissingJson: jsonb("debug_panel_missing_json"),

  overallScore: real("overall_score"),
  overallPass: boolean("overall_pass"),
  summaryJson: jsonb("summary_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("enterprise_eval_artifacts_reply_id_idx").on(table.replyId),
  index("enterprise_eval_artifacts_run_id_idx").on(table.runId),
  index("enterprise_eval_artifacts_created_at_idx").on(table.createdAt),
]);

export const chatRepliesRelations = relations(chatReplies, ({ one, many }) => ({
  chat: one(conversations, { fields: [chatReplies.chatId], references: [conversations.id] }),
  message: one(messages, { fields: [chatReplies.messageId], references: [messages.id] }),
  retrievalArtifacts: many(replyRetrievalArtifacts),
  citationArtifacts: many(replyCitationArtifacts),
  llmEvalArtifacts: many(replyLlmEvalArtifacts),
  toolArtifacts: many(replyToolArtifacts),
  enterpriseEvalArtifacts: many(enterpriseEvalArtifacts),
}));

export const replyRetrievalArtifactsRelations = relations(replyRetrievalArtifacts, ({ one }) => ({
  reply: one(chatReplies, { fields: [replyRetrievalArtifacts.replyId], references: [chatReplies.id] }),
}));

export const replyCitationArtifactsRelations = relations(replyCitationArtifacts, ({ one }) => ({
  reply: one(chatReplies, { fields: [replyCitationArtifacts.replyId], references: [chatReplies.id] }),
}));

export const replyLlmEvalArtifactsRelations = relations(replyLlmEvalArtifacts, ({ one }) => ({
  reply: one(chatReplies, { fields: [replyLlmEvalArtifacts.replyId], references: [chatReplies.id] }),
}));

export const replyToolArtifactsRelations = relations(replyToolArtifacts, ({ one }) => ({
  reply: one(chatReplies, { fields: [replyToolArtifacts.replyId], references: [chatReplies.id] }),
}));

export const enterpriseEvalArtifactsRelations = relations(enterpriseEvalArtifacts, ({ one }) => ({
  reply: one(chatReplies, { fields: [enterpriseEvalArtifacts.replyId], references: [chatReplies.id] }),
  run: one(evalRuns, { fields: [enterpriseEvalArtifacts.runId], references: [evalRuns.id] }),
}));

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertChatReplySchema = createInsertSchema(chatReplies).omit({ id: true, createdAt: true });
export const insertReplyRetrievalArtifactSchema = createInsertSchema(replyRetrievalArtifacts).omit({ id: true, createdAt: true });
export const insertReplyCitationArtifactSchema = createInsertSchema(replyCitationArtifacts).omit({ id: true, createdAt: true });
export const insertReplyLlmEvalArtifactSchema = createInsertSchema(replyLlmEvalArtifacts).omit({ id: true, createdAt: true });
export const insertReplyToolArtifactSchema = createInsertSchema(replyToolArtifacts).omit({ id: true, createdAt: true });
export const insertEnterpriseEvalArtifactSchema = createInsertSchema(enterpriseEvalArtifacts).omit({ id: true, createdAt: true });

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ChatReply = typeof chatReplies.$inferSelect;
export type InsertChatReply = z.infer<typeof insertChatReplySchema>;
export type ReplyRetrievalArtifact = typeof replyRetrievalArtifacts.$inferSelect;
export type InsertReplyRetrievalArtifact = z.infer<typeof insertReplyRetrievalArtifactSchema>;
export type ReplyCitationArtifact = typeof replyCitationArtifacts.$inferSelect;
export type InsertReplyCitationArtifact = z.infer<typeof insertReplyCitationArtifactSchema>;
export type ReplyLlmEvalArtifact = typeof replyLlmEvalArtifacts.$inferSelect;
export type InsertReplyLlmEvalArtifact = z.infer<typeof insertReplyLlmEvalArtifactSchema>;
export type ReplyToolArtifact = typeof replyToolArtifacts.$inferSelect;
export type InsertReplyToolArtifact = z.infer<typeof insertReplyToolArtifactSchema>;
export type EnterpriseEvalArtifact = typeof enterpriseEvalArtifacts.$inferSelect;
export type InsertEnterpriseEvalArtifact = z.infer<typeof insertEnterpriseEvalArtifactSchema>;


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
export type JobLock = typeof jobLocks.$inferSelect;
export type InsertJobLock = z.infer<typeof insertJobLockSchema>;
export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type InsertRateLimitBucket = z.infer<typeof insertRateLimitBucketSchema>;
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
export type VoiceCall = typeof voiceCalls.$inferSelect;
export type InsertVoiceCall = z.infer<typeof insertVoiceCallSchema>;
export type VoiceTurn = typeof voiceTurns.$inferSelect;
export type InsertVoiceTurn = z.infer<typeof insertVoiceTurnSchema>;
export type ChatReplyRow = typeof chatReplies.$inferSelect;

// ============================================================================
// VALIDATION SCHEMAS (for AI responses)
// ============================================================================

export const citationSchema = z.object({
  sourceId: z.string(),
  sourceVersionId: z.string().optional(),
  chunkId: z.string(),
  charStart: z.number().optional(),
  charEnd: z.number().optional(),
  url: z.string().optional(), // External URL to original document
  label: z.string().optional(), // Human-readable label for citation
  title: z.string().optional(),
  snippet: z.string().optional(),
  score: z.number().optional(),
  sourceType: z.string().optional(),
  externalId: z.string().optional(),
  mimeType: z.string().optional(),
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
  answer_text: z.string().optional(),
  bullets: z.array(bulletSchema),
  details_blocks: z.array(z.object({
    type: z.string(),
    title: z.string().optional(),
    data: z.any(),
  })).optional(),
  retrieved_chunks: z.array(z.object({
    chunkId: z.string(),
    sourceId: z.string(),
    score: z.number().optional(),
    snippet: z.string(),
  })).optional(),
  framingContext: z.string().optional(),  // Contextual framing line for doc-intent responses
  summary: z.string().optional(),         // Executive summary for doc-intent responses
  action: actionSchema.nullable(),
  needsClarification: z.boolean(),
  clarifyingQuestions: z.array(z.string()),
  conversationId: z.string().optional(),
  citations: z.array(citationSchema.extend({
    title: z.string().optional(),
    snippet: z.string().optional(),
    score: z.number().optional(),
    sourceType: z.string().optional(),
    sourceTypeLabel: z.string().optional(),
    locationUrl: z.string().optional(),
    externalId: z.string().optional(),
    mimeType: z.string().optional(),
  })).optional(), // Top-level citations for all retrieved sources
  sources: z.array(citationSchema.extend({
    title: z.string().optional(),
    snippet: z.string().optional(),
    score: z.number().optional(),
    sourceType: z.string().optional(),
    sourceTypeLabel: z.string().optional(),
    locationUrl: z.string().optional(),
    externalId: z.string().optional(),
    mimeType: z.string().optional(),
  })).optional(), // Alias for citations to satisfy UI contract
  sources_used: z.array(citationSchema.extend({
    title: z.string().optional(),
    snippet: z.string().optional(),
    score: z.number().optional(),
    sourceType: z.string().optional(),
    sourceTypeLabel: z.string().optional(),
    locationUrl: z.string().optional(),
    externalId: z.string().optional(),
    mimeType: z.string().optional(),
  })).optional(),
  sections: z.array(z.object({
    title: z.string(),
    items: z.array(z.object({
      text: z.string(),
      kind: z.enum(["objective", "kr", "bullet"]),
      owner: z.string().optional(),
      target: z.string().optional(),
      current: z.string().optional(),
      due: z.string().optional(),
      status: z.string().optional(),
      citations: z.array(citationSchema).optional(),
    }))
  })).optional(),
  citationIndexMap: z.record(z.number()).optional(),
  details: z.object({
    summaryRows: z.array(z.object({
      item: z.string(),
      priority: z.string(),
      owner: z.string(),
      impact: z.string(),
      citationIds: z.array(z.string()),
    })),
    evidenceBySource: z.array(z.object({
      sourceKey: z.string(),
      title: z.string(),
      label: z.string(),
      url: z.string(),
      excerpts: z.array(z.object({ text: z.string() })),
    })),
  }).optional(),
  debug: z.object({
    structured_report_raw: z.any().optional(),
    retrieved_chunks_raw: z.any().optional(),
    citation_mapping_raw: z.any().optional(),
    retrievedCount: z.number().optional(),
    usedFallback: z.boolean().optional(),
    traceId: z.string().optional(),
  }).optional(),
});

// ============================================================================
// Doc-Intent Response Schema (Enterprise-Grade)
// ============================================================================

export const docIntentResponseSchema = z.object({
  kind: z.literal("doc_intent"),
  intentType: z.enum(["okr", "blocker", "roadmap", "budget", "generic"]),

  framing: z.object({
    sentence: z.string(),           // "From Q4_2024_OKRs.pdf, here are the Q4 OKRs..."
    sourceSummary: z.string().optional()  // "(from 3 sources)"
  }),

  executiveSummary: z.array(z.object({
    text: z.string(),               // "Nov 15 launch • 2s p95 target"
    sourceIds: z.array(z.string()), // Must cite sources
    kind: z.enum(["extracted", "computed", "inferred"])
  })).optional(),

  sections: z.array(z.object({
    heading: z.string(),            // "Objective: Ship AI Search"
    items: z.array(z.object({
      id: z.string(),               // Stable ID for UI mapping
      kind: z.enum(["objective", "kr", "note", "related_context"]),
      text: z.string(),             // Human-readable sentence

      // Optional structured fields
      fields: z.object({
        owner: z.string().optional(),
        target: z.string().optional(),
        current: z.string().optional(),
        due: z.string().optional(),
        status: z.string().optional()  // ONLY if in source quote
      }).optional(),

      // Per-claim provenance (MANDATORY)
      provenance: z.object({
        kind: z.enum(["extracted", "computed", "inferred"]),
        rule: z.string().optional(),      // Required if computed/inferred
        sourceIds: z.array(z.string()),   // MUST be non-empty for extracted
        quotes: z.array(z.object({
          sourceId: z.string(),
          chunkId: z.string(),
          quote: z.string()
        })).optional()  // Show when N>1 sources
      })
    }))
  })),

  evidence: z.array(z.object({
    id: z.string(),                 // sourceId
    title: z.string(),
    url: z.string().optional(),     // Exact artifact URL
    locationUrl: z.string().optional(),  // Container location (folder/channel)
    connectorType: z.enum(["drive", "slack", "jira", "confluence"]),
    connectorLabel: z.string(),     // "Drive" | "Slack" | etc.
    whyUsed: z.string().optional()  // "KR2 latency target"
  }))
});

export type Citation = z.infer<typeof citationSchema>;
export type Bullet = z.infer<typeof bulletSchema>;
export type Action = z.infer<typeof actionSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type Section = NonNullable<ChatResponse["sections"]>[number];
export type SectionItem = Section["items"][number];
export type ChatDetails = NonNullable<ChatResponse["details"]>;
export type SummaryRow = ChatDetails["summaryRows"][number];
export type EvidenceSource = ChatDetails["evidenceBySource"][number];
export type ChatDebug = NonNullable<ChatResponse["debug"]>;
export type DocIntentResponse = z.infer<typeof docIntentResponseSchema>;
export type DocIntentEvidence = DocIntentResponse["evidence"][number];
export type DocIntentSection = DocIntentResponse["sections"][number];
export type DocIntentItem = DocIntentSection["items"][number];

// ============================================================================
// OKR Answer View Model (Enterprise-Grade)
// ============================================================================

export const krStatusEnum = z.enum(["On Track", "At Risk", "Behind"]);
export type KRStatus = z.infer<typeof krStatusEnum>;

export const evidenceKindEnum = z.enum(["cited", "context"]);
export type EvidenceKind = z.infer<typeof evidenceKindEnum>;

export const citationIndexEntrySchema = z.object({
  id: z.number(),                         // 1-based stable number
  sourceId: z.string(),
  title: z.string(),
  url: z.string().optional(),
  locationUrl: z.string().optional(),
  connectorType: z.string().optional(),
  connectorLabel: z.string().optional(),
  why: z.string().optional(),             // "KR2 latency target"
  description: z.string().optional(),     // "Defines Q4 latency targets and owner assignments"
  kind: evidenceKindEnum.optional(),      // "cited" = directly cited, "context" = retrieved but not cited
});

export const keyResultViewSchema = z.object({
  text: z.string(),
  owner: z.string().optional(),
  target: z.string().optional(),
  current: z.string().optional(),
  status: krStatusEnum.nullable().optional(),
  due: z.string().optional(),
  citationIds: z.array(z.number()),       // [1, 2] references into citationIndex
});

export const objectiveViewSchema = z.object({
  title: z.string(),
  owner: z.string().optional(),
  keyResults: z.array(keyResultViewSchema),
});

export const keyFactViewSchema = z.object({
  text: z.string(),
  citationIds: z.array(z.number()),
});

export const okrAnswerViewModelSchema = z.object({
  title: z.string(),                      // "Q4 OKRs - AI Search Project"
  timeframe: z.string().optional(),       // "Q4 2024"
  framingContext: z.string().optional(),  // Executive framing: "Here are the Q4 OKRs for AI Search, based on 3 sources."
  keyFacts: z.array(keyFactViewSchema),
  objectives: z.array(objectiveViewSchema),
  citationIndex: z.array(citationIndexEntrySchema),
  sourcesUsed: z.array(citationIndexEntrySchema),
  sourcesRelated: z.array(citationIndexEntrySchema),
});

export type CitationIndexEntry = z.infer<typeof citationIndexEntrySchema>;
export type KeyResultView = z.infer<typeof keyResultViewSchema>;
export type ObjectiveView = z.infer<typeof objectiveViewSchema>;
export type KeyFactView = z.infer<typeof keyFactViewSchema>;
export type OkrAnswerViewModel = z.infer<typeof okrAnswerViewModelSchema>;

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

// Discriminated union type for seed eval cases
// This allows TypeScript to properly narrow types based on the 'type' field
export type SeedEvalCase =
  | {
    id: string;
    type: "QNA";
    prompt: string;
    mustCite?: boolean;
    expectedSourceIds?: string[];
    expectedAnswerContains?: string[];
    expectedAnswerNotContains?: string[];
    expectedRefusal?: boolean;
    expectedRefusalReason?: string;
    policyViolation?: string;
    injectionType?: string;
    expectedIgnored?: boolean;
    expectedDetection?: boolean;
    context?: string;
    expectedTool?: never;
    requiredFields?: never;
  }
  | {
    id: string;
    type: "ACTION";
    prompt: string;
    expectedTool?: string;
    requiredFields?: string[];
    expectedRefusal?: boolean;
    expectedRefusalReason?: string;
    policyViolation?: string;
    injectionType?: string;
    expectedIgnored?: boolean;
    expectedDetection?: boolean;
    context?: string;
    expectedAnswerContains?: string[];
    expectedAnswerNotContains?: string[];
    mustCite?: never;
    expectedSourceIds?: never;
  };

// Discriminated union type for runtime eval cases (used in runEvalCases)
// Similar to SeedEvalCase but includes expectedSourceVersionIds for runtime evaluation
export type RuntimeEvalCase =
  | {
    id: string;
    type: "QNA";
    prompt: string;
    mustCite?: boolean;
    expectedSourceIds?: string[];
    expectedSourceVersionIds?: string[];
    expectedAnswerContains?: string[];
    expectedAnswerNotContains?: string[];
    expectedRefusal?: boolean;
    expectedRefusalReason?: string;
    policyViolation?: string;
    injectionType?: string;
    expectedIgnored?: boolean;
    expectedDetection?: boolean;
    context?: string;
    expectedTool?: never;
    requiredFields?: never;
  }
  | {
    id: string;
    type: "ACTION";
    prompt: string;
    expectedTool?: string;
    requiredFields?: string[];
    expectedRefusal?: boolean;
    expectedRefusalReason?: string;
    policyViolation?: string;
    injectionType?: string;
    expectedIgnored?: boolean;
    expectedDetection?: boolean;
    context?: string;
    expectedAnswerContains?: string[];
    expectedAnswerNotContains?: string[];
    expectedSourceVersionIds?: string[];
    mustCite?: never;
    expectedSourceIds?: never;
  };
