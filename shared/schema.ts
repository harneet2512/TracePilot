import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
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
  configJson: text("config_json").notNull(), // Encrypted if ENCRYPTION_KEY exists
  status: text("status", { enum: ["connected", "disconnected", "error"] }).notNull().default("disconnected"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User connector accounts for per-user OAuth tokens
export const userConnectorAccounts = pgTable("user_connector_accounts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["google", "atlassian", "slack"] }).notNull(),
  accessToken: text("access_token").notNull(), // Encrypted if ENCRYPTION_KEY exists
  refreshToken: text("refresh_token"), // Encrypted if ENCRYPTION_KEY exists
  expiresAt: timestamp("expires_at"),
  scopesJson: jsonb("scopes_json"), // OAuth scopes granted
  externalAccountId: text("external_account_id"), // e.g., Google user ID, Atlassian account ID
  metadataJson: jsonb("metadata_json"), // Provider-specific metadata
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
  // Scope selections stored as JSON
  scopeConfigJson: jsonb("scope_config_json").notNull(), // Provider-specific scope config
  syncMode: text("sync_mode", { enum: ["metadata_first", "full", "smart", "on_demand"] }).notNull().default("metadata_first"),
  contentStrategy: text("content_strategy", { enum: ["smart", "full", "on_demand"] }).notNull().default("smart"),
  exclusionsJson: jsonb("exclusions_json"), // File types, patterns, channels to exclude
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

// Sources for ingested documents (now user-scoped)
export const sources = pgTable("sources", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }), // User-scoped
  type: text("type", { enum: ["upload", "confluence", "drive", "jira", "slack"] }).notNull(),
  title: text("title").notNull(),
  url: text("url"),
  contentHash: text("content_hash").notNull(),
  metadataJson: jsonb("metadata_json"),
  fullText: text("full_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("sources_content_hash_idx").on(table.contentHash),
  index("sources_user_id_idx").on(table.userId),
]);

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  user: one(users, { fields: [sources.userId], references: [users.id] }),
  chunks: many(chunks),
}));

// Chunks for document segments (now user-scoped)
export const chunks = pgTable("chunks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }), // User-scoped
  sourceId: varchar("source_id", { length: 36 }).notNull().references(() => sources.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  charStart: integer("char_start"),
  charEnd: integer("char_end"),
  tokenEstimate: integer("token_estimate"),
  vectorRef: text("vector_ref"), // Reference to vector in pgvector or Qdrant
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("chunks_source_id_idx").on(table.sourceId),
  index("chunks_vector_ref_idx").on(table.vectorRef),
  index("chunks_user_id_idx").on(table.userId),
]);

export const chunksRelations = relations(chunks, ({ one }) => ({
  user: one(users, { fields: [chunks.userId], references: [users.id] }),
  source: one(sources, { fields: [chunks.sourceId], references: [sources.id] }),
}));

// Policies for role/tool constraints (YAML-based)
export const policies = pgTable("policies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  yamlText: text("yaml_text").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Audit events for comprehensive logging
export const auditEvents = pgTable("audit_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  role: text("role"),
  kind: text("kind", { enum: ["chat", "action_execute", "eval", "replay", "sync"] }).notNull(),
  prompt: text("prompt"),
  retrievedJson: jsonb("retrieved_json"),
  responseJson: jsonb("response_json"),
  toolProposalsJson: jsonb("tool_proposals_json"),
  toolExecutionsJson: jsonb("tool_executions_json"),
  policyJson: jsonb("policy_json"),
  approvalJson: jsonb("approval_json"),
  success: boolean("success"),
  error: text("error"),
  latencyMs: jsonb("latency_ms"), // { embedMs, retrievalMs, llmMs, toolMs }
  replayOf: varchar("replay_of", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("audit_events_user_id_idx").on(table.userId),
  index("audit_events_request_id_idx").on(table.requestId),
  index("audit_events_kind_idx").on(table.kind),
  index("audit_events_created_at_idx").on(table.createdAt),
]);

export const auditEventsRelations = relations(auditEvents, ({ one, many }) => ({
  user: one(users, { fields: [auditEvents.userId], references: [users.id] }),
  approvals: many(approvals),
}));

// Approvals for action execution
export const approvals = pgTable("approvals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  auditEventId: varchar("audit_event_id", { length: 36 }).notNull().references(() => auditEvents.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  toolName: text("tool_name").notNull(),
  draftJson: jsonb("draft_json").notNull(),
  finalJson: jsonb("final_json"),
  idempotencyKey: text("idempotency_key"),
  result: jsonb("result"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("approvals_audit_event_id_idx").on(table.auditEventId),
  index("approvals_idempotency_key_idx").on(table.idempotencyKey),
]);

export const approvalsRelations = relations(approvals, ({ one }) => ({
  auditEvent: one(auditEvents, { fields: [approvals.auditEventId], references: [auditEvents.id] }),
  user: one(users, { fields: [approvals.userId], references: [users.id] }),
}));

// Evaluation suites
export const evalSuites = pgTable("eval_suites", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  jsonText: text("json_text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const evalSuitesRelations = relations(evalSuites, ({ many }) => ({
  runs: many(evalRuns),
}));

// Evaluation runs
export const evalRuns = pgTable("eval_runs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  suiteId: varchar("suite_id", { length: 36 }).notNull().references(() => evalSuites.id),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  summaryJson: jsonb("summary_json"), // { total, passed, failed, passRate }
  resultsJson: jsonb("results_json"), // Array of per-case results
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const evalRunsRelations = relations(evalRuns, ({ one }) => ({
  suite: one(evalSuites, { fields: [evalRuns.suiteId], references: [evalSuites.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export const insertConnectorSchema = createInsertSchema(connectors).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserConnectorAccountSchema = createInsertSchema(userConnectorAccounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserConnectorScopeSchema = createInsertSchema(userConnectorScopes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSourceSchema = createInsertSchema(sources).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChunkSchema = createInsertSchema(chunks).omit({ id: true, createdAt: true });
export const insertPolicySchema = createInsertSchema(policies).omit({ id: true, createdAt: true });
export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({ id: true, createdAt: true });
export const insertApprovalSchema = createInsertSchema(approvals).omit({ id: true, createdAt: true });
export const insertEvalSuiteSchema = createInsertSchema(evalSuites).omit({ id: true, createdAt: true });
export const insertEvalRunSchema = createInsertSchema(evalRuns).omit({ id: true, createdAt: true });

// Types
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
export type Chunk = typeof chunks.$inferSelect;
export type InsertChunk = z.infer<typeof insertChunkSchema>;
export type Policy = typeof policies.$inferSelect;
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type Approval = typeof approvals.$inferSelect;
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type EvalSuite = typeof evalSuites.$inferSelect;
export type InsertEvalSuite = z.infer<typeof insertEvalSuiteSchema>;
export type EvalRun = typeof evalRuns.$inferSelect;
export type InsertEvalRun = z.infer<typeof insertEvalRunSchema>;

// Chat response schema (for LLM output validation)
export const citationSchema = z.object({
  sourceId: z.string(),
  chunkId: z.string(),
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

// Eval suite schema
export const evalCaseSchema = z.object({
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
  cases: z.array(evalCaseSchema),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;
export type EvalSuiteJson = z.infer<typeof evalSuiteJsonSchema>;
