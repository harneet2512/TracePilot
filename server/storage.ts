import { db as _db, pool } from "./db";
const db = new Proxy({}, {
  get: (_target, prop) => (_db as any)[prop]
}) as any;
import { eq, desc, and, inArray, lte, isNull, sql, gt, gte, or } from "drizzle-orm";
import {
  users, workspaces, sessions, connectors, userConnectorAccounts, userConnectorScopes,
  sources, chunks, policies, auditEvents, approvals, evalSuites, evalRuns,
  jobs, jobRuns, traces, spans, sourceVersions, evalCases, evalResults, playbooks, playbookItems,
  jobLocks, rateLimitBuckets, voiceCalls, voiceTurns,
  type User, type InsertUser, type Session, type InsertSession,
  type Connector, type InsertConnector,
  type UserConnectorAccount, type InsertUserConnectorAccount,
  type UserConnectorScope, type InsertUserConnectorScope,
  type Source, type InsertSource,
  type Chunk, type InsertChunk, type Policy, type InsertPolicy,
  type AuditEvent, type InsertAuditEvent, type Approval, type InsertApproval,
  type EvalSuite, type InsertEvalSuite, type EvalRun, type InsertEvalRun,
  type Job, type InsertJob, type JobRun, type InsertJobRun,
  type JobLock, type InsertJobLock, type RateLimitBucket, type InsertRateLimitBucket,
  type Trace, type InsertTrace, type Span, type InsertSpan,
  type SourceVersion, type InsertSourceVersion,
  type EvalCase, type InsertEvalCase, type EvalResult, type InsertEvalResult,
  type Playbook, type InsertPlaybook, type PlaybookItem, type InsertPlaybookItem,
  type VoiceCall, type InsertVoiceCall, type VoiceTurn, type InsertVoiceTurn,
  type Conversation, type InsertConversation, type Message, type InsertMessage,
  type ChatReply, type InsertChatReply,
  type ReplyRetrievalArtifact, type InsertReplyRetrievalArtifact,
  type ReplyCitationArtifact, type InsertReplyCitationArtifact,
  type ReplyLlmEvalArtifact, type InsertReplyLlmEvalArtifact,
  type ReplyToolArtifact, type InsertReplyToolArtifact,
  type EnterpriseEvalArtifact, type InsertEnterpriseEvalArtifact,
  conversations, messages, chatReplies, replyRetrievalArtifacts, replyCitationArtifacts, replyLlmEvalArtifacts, replyToolArtifacts, enterpriseEvalArtifacts
} from "@shared/schema";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { timingSafeEqual } from "crypto";

export interface ChatQualityFilters {
  dateFrom?: Date;
  dateTo?: Date;
  environment?: string;
  model?: string;
  status?: "ok" | "error";
  hasRegressions?: boolean;
  needsReview?: boolean;
}

export interface ChatQualityOverview {
  chatCount: number;
  replyCount: number;
  successRate: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p95TtftMs: number;
  avgTokens: number;
  p95Tokens: number;
  totalCostUsd: number;
  avgUnsupportedClaimRate: number;
  p95UnsupportedClaimRate: number;
  avgCitationIntegrityRate: number;
  toolFailureRate: number;
  lowEvidenceFailuresCount: number;
  contradictionHandlingFailuresCount: number;
  enterpriseOverallPassRate?: number;
  enterpriseCitationUiReadinessRate?: number;
  enterpriseHallucinationAvoidanceRate?: number;
  enterpriseStabilityPassRate?: number;
}

export interface ChatQualityTimeseriesPoint {
  bucket: string;
  successRate: number;
  p95LatencyMs: number;
  unsupportedClaimRate: number;
  citationIntegrityRate: number;
}

export interface AdminConversationListResult {
  rows: Conversation[];
  total: number;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  validatePassword(email: string, password: string): Promise<User | null>;

  // Sessions
  createSession(userId: string): Promise<Session>;
  getSessionByToken(token: string): Promise<Session | undefined>;
  deleteSession(token: string): Promise<void>;

  // Connectors
  getConnectors(): Promise<Connector[]>;
  getConnector(id: string): Promise<Connector | undefined>;
  createConnector(connector: InsertConnector): Promise<Connector>;
  updateConnector(id: string, updates: Partial<InsertConnector>): Promise<Connector | undefined>;
  deleteConnector(id: string): Promise<void>;

  // User Connector Accounts
  getUserConnectorAccounts(userId: string): Promise<UserConnectorAccount[]>;
  getAllConnectorAccounts(): Promise<UserConnectorAccount[]>;
  getUserConnectorAccount(id: string): Promise<UserConnectorAccount | undefined>;
  getUserConnectorAccountByType(userId: string, type: string): Promise<UserConnectorAccount | undefined>;
  createUserConnectorAccount(account: InsertUserConnectorAccount): Promise<UserConnectorAccount>;
  updateUserConnectorAccount(id: string, updates: Partial<InsertUserConnectorAccount>): Promise<UserConnectorAccount | undefined>;
  deleteUserConnectorAccount(id: string): Promise<void>;

  // User Connector Scopes
  getUserConnectorScopes(userId: string): Promise<UserConnectorScope[]>;
  getUserConnectorScopesByAccount(accountId: string): Promise<UserConnectorScope[]>;
  getUserConnectorScope(id: string): Promise<UserConnectorScope | undefined>;
  createUserConnectorScope(scope: InsertUserConnectorScope): Promise<UserConnectorScope>;
  updateUserConnectorScope(id: string, updates: Partial<InsertUserConnectorScope>): Promise<UserConnectorScope | undefined>;
  deleteUserConnectorScope(id: string): Promise<void>;

  // Sources
  getSources(): Promise<Source[]>;
  getSource(id: string): Promise<Source | undefined>;
  getSourceWithChunks(id: string): Promise<{ source: Source; chunks: Chunk[] } | undefined>;
  getSourceByContentHash(hash: string): Promise<Source | undefined>;
  getSourcesByUserAndType(userId: string, type: string): Promise<Source[]>;
  getSourceByExternalId(externalId: string, userId: string): Promise<Source | undefined>;
  createSource(source: InsertSource): Promise<Source>;
  updateSource(id: string, updates: Partial<InsertSource>): Promise<Source | undefined>;
  deleteSource(id: string): Promise<void>;
  upsertSource(workspaceId: string, externalId: string, type: string, userId: string, source: InsertSource): Promise<Source>;

  // Chunks
  getChunk(id: string): Promise<Chunk | undefined>;
  createChunk(chunk: InsertChunk): Promise<Chunk>;
  createChunks(chunks: InsertChunk[]): Promise<Chunk[]>;
  getChunksBySourceId(sourceId: string): Promise<Chunk[]>;
  getChunksByIds(ids: string[]): Promise<Chunk[]>;
  getAllChunks(): Promise<Chunk[]>;
  updateChunk(id: string, updates: Partial<InsertChunk>): Promise<Chunk | undefined>;

  // Policies
  getPolicies(): Promise<Policy[]>;
  getActivePolicy(): Promise<Policy | undefined>;
  createPolicy(policy: InsertPolicy): Promise<Policy>;
  updatePolicy(id: string, updates: Partial<InsertPolicy>): Promise<Policy | undefined>;
  deletePolicy(id: string): Promise<void>;

  // Audit Events
  getAuditEvents(limit?: number): Promise<AuditEvent[]>;
  getAuditEvent(id: string): Promise<AuditEvent | undefined>;
  getAuditEventByRequestId(requestId: string): Promise<AuditEvent | undefined>;
  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;

  // Approvals
  createApproval(approval: InsertApproval): Promise<Approval>;
  getApproval(id: string): Promise<Approval | undefined>;

  // Chat History
  getConversations(userId: string): Promise<Conversation[]>;
  getAdminConversations(filters?: ChatQualityFilters, page?: number, pageSize?: number): Promise<AdminConversationListResult>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(userId: string, title?: string): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;

  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessageMetadata(id: string, metadataJson: object): Promise<void>;
  createChatReply(reply: InsertChatReply): Promise<ChatReply>;
  getChatReply(id: string): Promise<ChatReply | undefined>;
  getChatReplyByMessageId(messageId: string): Promise<ChatReply | undefined>;
  getChatRepliesByChat(chatId: string): Promise<ChatReply[]>;
  updateChatReply(id: string, updates: Partial<InsertChatReply>): Promise<ChatReply | undefined>;
  createRetrievalArtifact(artifact: InsertReplyRetrievalArtifact): Promise<ReplyRetrievalArtifact>;
  getRetrievalArtifact(replyId: string): Promise<ReplyRetrievalArtifact | undefined>;
  createCitationArtifact(artifact: InsertReplyCitationArtifact): Promise<ReplyCitationArtifact>;
  getCitationArtifact(replyId: string): Promise<ReplyCitationArtifact | undefined>;
  createEvalArtifact(artifact: InsertReplyLlmEvalArtifact): Promise<ReplyLlmEvalArtifact>;
  getEvalArtifact(replyId: string): Promise<ReplyLlmEvalArtifact | undefined>;
  createToolArtifact(artifact: InsertReplyToolArtifact): Promise<ReplyToolArtifact>;
  getToolArtifact(replyId: string): Promise<ReplyToolArtifact | undefined>;
  createEnterpriseEvalArtifact(artifact: InsertEnterpriseEvalArtifact): Promise<EnterpriseEvalArtifact>;
  getEnterpriseEvalArtifact(replyId: string): Promise<EnterpriseEvalArtifact | undefined>;
  getEnterpriseEvalArtifactsByRunId(runId: string): Promise<EnterpriseEvalArtifact[]>;
  getChatQualityOverview(filters?: ChatQualityFilters): Promise<ChatQualityOverview>;
  getChatQualityTimeseries(filters?: ChatQualityFilters): Promise<ChatQualityTimeseriesPoint[]>;
  getApprovalByIdempotencyKey(key: string): Promise<Approval | undefined>;
  updateApproval(id: string, updates: Partial<InsertApproval>): Promise<Approval | undefined>;

  // Eval
  getEvalSuites(): Promise<EvalSuite[]>;
  getEvalSuite(id: string): Promise<EvalSuite | undefined>;
  createEvalSuite(suite: InsertEvalSuite): Promise<EvalSuite>;
  deleteEvalSuite(id: string): Promise<void>;
  createEvalCase(evalCase: InsertEvalCase): Promise<EvalCase>;
  getEvalCase(id: string): Promise<EvalCase | undefined>;
  getEvalCasesBySuiteId(suiteId: string): Promise<EvalCase[]>;

  // Eval Runs
  getEvalRun(id: string): Promise<EvalRun | undefined>;
  getEvalRuns(): Promise<EvalRun[]>;
  getEvalRunsBySuiteId(suiteId: string): Promise<EvalRun[]>;
  getEvalRunsBySuiteIdPaginated(suiteId: string, limit: number, offset: number): Promise<EvalRun[]>;
  createEvalRun(run: InsertEvalRun): Promise<EvalRun>;
  updateEvalRun(id: string, updates: Partial<InsertEvalRun>): Promise<EvalRun | undefined>;
  updateEvalSuiteBaseline(suiteId: string, baselineRunId: string | null): Promise<EvalSuite | undefined>;
  updateEvalSuiteThresholds(suiteId: string, thresholds: Record<string, unknown> | null): Promise<EvalSuite | undefined>;

  // Eval Results
  getEvalResults(runId: string): Promise<EvalResult[]>;
  getEvalResultsByRunIds(runIds: string[]): Promise<EvalResult[]>;
  createEvalResult(result: InsertEvalResult): Promise<EvalResult>;

  // Jobs
  getJob(id: string): Promise<Job | undefined>;
  getJobByIdempotencyKey(key: string): Promise<Job | undefined>;
  getPendingJobs(limit?: number): Promise<Job[]>;
  getPendingJobCount(): Promise<number>;
  getJobsByUser(userId: string): Promise<Job[]>;
  getDeadLetterJobs(): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, updates: Partial<InsertJob>): Promise<Job | undefined>;
  lockJob(jobId: string, workerId: string): Promise<Job | undefined>;
  unlockJob(jobId: string): Promise<void>;
  unlockStaleJob(jobId: string, expectedWorkerId: string): Promise<boolean>;
  getStaleRunningJobs(staleThreshold: Date): Promise<Job[]>;

  // Job Runs
  getJobRuns(jobId: string): Promise<JobRun[]>;
  getLatestJobRun(jobId: string): Promise<JobRun | undefined>;
  getLatestSyncJobForScope(scopeId: string): Promise<Job | undefined>;
  getCountsByScope(scopeId: string): Promise<{ sources: number; chunks: number }>;
  getIngestionSummary(workspaceId?: string): Promise<{
    totalSources: number;
    totalChunks: number;
    lastSyncAt: Date | null;
    activeSyncJobs: Array<{ id: string; scopeId: string | null; connectorType: string | null; status: string }>;
  }>;
  createJobRun(run: InsertJobRun): Promise<JobRun>;
  updateJobRun(id: string, updates: Partial<InsertJobRun>): Promise<JobRun | undefined>;

  // Job locking with SKIP LOCKED
  claimJobWithLock(workerId: string, limit?: number): Promise<Job | undefined>;
  getLatestJobByScope(scopeId: string): Promise<Job | undefined>;

  // Concurrency control
  getOrCreateJobLock(connectorType: string, accountId?: string): Promise<JobLock>;
  incrementJobLockCount(lockId: string): Promise<boolean>;
  decrementJobLockCount(lockId: string): Promise<void>;
  canAcquireConcurrencySlot(connectorType: string, accountId?: string): Promise<boolean>;

  // Rate limiting
  getOrCreateRateLimitBucket(accountId: string, connectorType: string): Promise<RateLimitBucket>;
  consumeRateLimitToken(accountId: string, connectorType: string): Promise<boolean>;

  // Active chunks retrieval (respecting source versioning)
  getActiveChunkCount(): Promise<number>;
  getActiveChunks(): Promise<Chunk[]>;
  getActiveChunksBounded(limit: number): Promise<Chunk[]>;
  getActiveChunksByUser(userId: string): Promise<Chunk[]>;

  // Traces
  getTrace(id: string): Promise<Trace | undefined>;
  getTracesByUser(userId: string, limit?: number): Promise<Trace[]>;
  getRecentTraces(limit?: number): Promise<Trace[]>;
  createTrace(trace: InsertTrace): Promise<Trace>;
  updateTrace(id: string, updates: Partial<InsertTrace>): Promise<Trace | undefined>;

  // Spans
  getSpansByTrace(traceId: string): Promise<Span[]>;
  createSpan(span: InsertSpan): Promise<Span>;
  updateSpan(id: string, updates: Partial<InsertSpan>): Promise<Span | undefined>;

  // Source Versions
  getSourceVersions(sourceId: string): Promise<SourceVersion[]>;
  getActiveSourceVersion(sourceId: string): Promise<SourceVersion | undefined>;
  createSourceVersion(version: InsertSourceVersion): Promise<SourceVersion>;
  deactivateSourceVersions(sourceId: string): Promise<void>;

  // Playbooks
  getPlaybook(id: string): Promise<Playbook | undefined>;
  getPlaybooksByUser(userId: string): Promise<Playbook[]>;
  createPlaybook(playbook: InsertPlaybook): Promise<Playbook>;
  updatePlaybook(id: string, updates: Partial<InsertPlaybook>): Promise<Playbook | undefined>;

  // Playbook Items
  getPlaybookItems(playbookId: string): Promise<PlaybookItem[]>;
  createPlaybookItem(item: InsertPlaybookItem): Promise<PlaybookItem>;
  updatePlaybookItem(id: string, updates: Partial<InsertPlaybookItem>): Promise<PlaybookItem | undefined>;

  // Voice Calls
  createVoiceCall(call: InsertVoiceCall): Promise<VoiceCall>;
  getVoiceCall(id: string): Promise<VoiceCall | undefined>;
  updateVoiceCall(id: string, updates: Partial<InsertVoiceCall>): Promise<VoiceCall | undefined>;
  getVoiceCallsByUser(userId: string): Promise<VoiceCall[]>;

  // Voice Turns
  createVoiceTurn(turn: InsertVoiceTurn): Promise<VoiceTurn>;
  getVoiceTurnsByCall(callId: string): Promise<VoiceTurn[]>;
}

const SALT_ROUNDS = 10;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function computePercentile(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
  return sorted[idx];
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function min(values: number[]): number {
  if (!values.length) return 0;
  return Math.min(...values);
}

function max(values: number[]): number {
  if (!values.length) return 0;
  return Math.max(...values);
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const passwordHash = insertUser.passwordHash
      ? await bcrypt.hash(insertUser.passwordHash, SALT_ROUNDS)
      : null;

    const [user] = await db.insert(users).values({
      ...insertUser,
      passwordHash,
    }).returning();
    return user;
  }

  async validatePassword(email: string, password: string): Promise<User | null> {
    console.log(`[STORAGE] validatePassword called for ${email}`);
    const user = await this.getUserByEmail(email);
    console.log(`[STORAGE] getUserByEmail returned: ${user ? "USER_FOUND" : "USER_NOT_FOUND"}`);

    if (user && user.passwordHash) {
      console.log(`[STORAGE] Comparing password hash...`);
      const valid = await bcrypt.compare(password, user.passwordHash);
      console.log(`[STORAGE] Password valid: ${valid}`);
      if (valid) return user;
    }

    // Extra credential from env (additive - does not replace DB auth)
    const extraEmail = process.env.APP_EXTRA_LOGIN_EMAIL;
    const extraPassword = process.env.APP_EXTRA_LOGIN_PASSWORD;
    if (extraEmail && extraPassword) {
      const emailBuf = Buffer.from(email.trim().toLowerCase(), "utf8");
      const extraEmailBuf = Buffer.from(extraEmail.trim().toLowerCase(), "utf8");
      const emailMatch = emailBuf.length === extraEmailBuf.length && timingSafeEqual(emailBuf, extraEmailBuf);
      const pwBuf = Buffer.from(password, "utf8");
      const extraPwBuf = Buffer.from(extraPassword, "utf8");
      const pwMatch = pwBuf.length === extraPwBuf.length && timingSafeEqual(pwBuf, extraPwBuf);
      if (emailMatch && pwMatch) {
        let targetUser = await this.getUserByEmail(extraEmail);
        if (!targetUser) {
          try {
            // Use existing workspace (DB may not have migration-inserted default)
            const [existingWs] = await db.select().from(workspaces).limit(1);
            let workspaceId = existingWs?.id;
            if (!workspaceId) {
              const [newWs] = await db.insert(workspaces).values({ name: "Default Workspace" }).returning();
              workspaceId = newWs?.id;
            }
            if (!workspaceId) {
              console.error("[STORAGE] Could not get or create workspace");
              return null;
            }
            targetUser = await this.createUser({
              workspaceId,
              email: extraEmail,
              passwordHash: extraPassword,
              role: "admin",
            });
          } catch (err) {
            console.error("[STORAGE] Extra-login createUser failed:", err);
            return null;
          }
        }
        return targetUser;
      }
    }
    return null;
  }

  // Sessions
  async createSession(userId: string): Promise<Session> {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const [session] = await db.insert(sessions).values({
      userId,
      token,
      expiresAt,
    }).returning();
    return session;
  }

  async getSessionByToken(token: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions)
      .where(and(
        eq(sessions.token, token),
      ));

    if (session && new Date(session.expiresAt) < new Date()) {
      await this.deleteSession(token);
      return undefined;
    }
    return session;
  }

  async deleteSession(token: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.token, token));
  }

  // Connectors
  async getConnectors(): Promise<Connector[]> {
    return db.select().from(connectors).orderBy(desc(connectors.createdAt));
  }

  async getConnector(id: string): Promise<Connector | undefined> {
    const [connector] = await db.select().from(connectors).where(eq(connectors.id, id));
    return connector;
  }

  async createConnector(connector: InsertConnector): Promise<Connector> {
    const [created] = await db.insert(connectors).values(connector).returning();
    return created;
  }

  async updateConnector(id: string, updates: Partial<InsertConnector>): Promise<Connector | undefined> {
    const [updated] = await db.update(connectors)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(connectors.id, id))
      .returning();
    return updated;
  }

  async deleteConnector(id: string): Promise<void> {
    await db.delete(connectors).where(eq(connectors.id, id));
  }

  // User Connector Accounts
  async getUserConnectorAccounts(userId: string): Promise<UserConnectorAccount[]> {
    return db.select().from(userConnectorAccounts)
      .where(eq(userConnectorAccounts.userId, userId))
      .orderBy(desc(userConnectorAccounts.createdAt));
  }

  async getUserConnectorAccount(id: string): Promise<UserConnectorAccount | undefined> {
    const [account] = await db.select().from(userConnectorAccounts)
      .where(eq(userConnectorAccounts.id, id));
    return account;
  }

  async getAllConnectorAccounts(): Promise<UserConnectorAccount[]> {
    return db.select().from(userConnectorAccounts)
      .orderBy(desc(userConnectorAccounts.createdAt));
  }

  async getUserConnectorAccountByType(userId: string, type: string): Promise<UserConnectorAccount | undefined> {
    const [account] = await db.select().from(userConnectorAccounts)
      .where(and(
        eq(userConnectorAccounts.userId, userId),
        eq(userConnectorAccounts.type, type as "google" | "atlassian" | "slack")
      ));
    return account;
  }

  async createUserConnectorAccount(account: InsertUserConnectorAccount): Promise<UserConnectorAccount> {
    const [created] = await db.insert(userConnectorAccounts).values(account).returning();
    return created;
  }

  async updateUserConnectorAccount(id: string, updates: Partial<InsertUserConnectorAccount>): Promise<UserConnectorAccount | undefined> {
    const [updated] = await db.update(userConnectorAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userConnectorAccounts.id, id))
      .returning();
    return updated;
  }

  async deleteUserConnectorAccount(id: string): Promise<void> {
    await db.delete(userConnectorAccounts).where(eq(userConnectorAccounts.id, id));
  }

  // User Connector Scopes
  async getUserConnectorScopes(userId: string): Promise<UserConnectorScope[]> {
    return db.select().from(userConnectorScopes)
      .where(eq(userConnectorScopes.userId, userId))
      .orderBy(desc(userConnectorScopes.createdAt));
  }

  async getUserConnectorScopesByAccount(accountId: string): Promise<UserConnectorScope[]> {
    return db.select().from(userConnectorScopes)
      .where(eq(userConnectorScopes.accountId, accountId))
      .orderBy(desc(userConnectorScopes.createdAt));
  }

  async getUserConnectorScope(id: string): Promise<UserConnectorScope | undefined> {
    const [scope] = await db.select().from(userConnectorScopes)
      .where(eq(userConnectorScopes.id, id));
    return scope;
  }

  async createUserConnectorScope(scope: InsertUserConnectorScope): Promise<UserConnectorScope> {
    const [created] = await db.insert(userConnectorScopes).values(scope).returning();
    return created;
  }

  async updateUserConnectorScope(id: string, updates: Partial<InsertUserConnectorScope>): Promise<UserConnectorScope | undefined> {
    const [updated] = await db.update(userConnectorScopes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userConnectorScopes.id, id))
      .returning();
    return updated;
  }

  async deleteUserConnectorScope(id: string): Promise<void> {
    await db.delete(userConnectorScopes).where(eq(userConnectorScopes.id, id));
  }

  /** Distinct connector types that have at least one scope for this workspace (for dynamic greeting). */
  async getActiveConnectorTypesForWorkspace(workspaceId: string): Promise<string[]> {
    const rows = await db.select({ type: userConnectorScopes.type })
      .from(userConnectorScopes)
      .where(eq(userConnectorScopes.workspaceId, workspaceId));
    const types: string[] = Array.from(new Set((rows as Array<{ type: string | null }>).map((r) => r.type).filter((t): t is string => t != null)));
    return types;
  }

  // Sources
  async getSources(): Promise<Source[]> {
    return db.select().from(sources).orderBy(desc(sources.createdAt));
  }

  async getSource(id: string): Promise<Source | undefined> {
    const [source] = await db.select().from(sources).where(eq(sources.id, id));
    return source;
  }

  async getSourceWithChunks(id: string): Promise<{ source: Source; chunks: Chunk[] } | undefined> {
    const source = await this.getSource(id);
    if (!source) return undefined;

    const sourceChunks = await db.select().from(chunks)
      .where(eq(chunks.sourceId, id))
      .orderBy(chunks.chunkIndex);

    return { source, chunks: sourceChunks };
  }

  async getSourceByContentHash(hash: string): Promise<Source | undefined> {
    const [source] = await db.select().from(sources).where(eq(sources.contentHash, hash));
    return source;
  }

  async getSourcesByUserAndType(userId: string, type: string): Promise<Source[]> {
    return db.select().from(sources)
      .where(and(eq(sources.userId, userId), eq(sources.type, type as typeof sources.type.enumValues[number])))
      .orderBy(desc(sources.createdAt));
  }

  async getSourceByExternalId(externalId: string, userId: string): Promise<Source | undefined> {
    const [source] = await db.select().from(sources)
      .where(and(eq(sources.externalId, externalId), eq(sources.userId, userId)));
    return source;
  }

  async createSource(source: InsertSource): Promise<Source> {
    const [created] = await db.insert(sources).values(source).returning();
    return created;
  }

  async updateSource(id: string, updates: Partial<InsertSource>): Promise<Source | undefined> {
    const [updated] = await db.update(sources)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(sources.id, id))
      .returning();
    return updated;
  }

  async deleteSource(id: string): Promise<void> {
    await db.delete(sources).where(eq(sources.id, id));
  }

  async upsertSource(workspaceId: string, externalId: string, type: string, userId: string, sourceData: InsertSource): Promise<Source> {
    const [existing] = await db.select().from(sources)
      .where(and(
        eq(sources.workspaceId, workspaceId),
        eq(sources.externalId, externalId),
        eq(sources.type, type as any),
        eq(sources.userId, userId)
      ));

    if (existing) {
      const [updated] = await db.update(sources)
        .set({ ...sourceData, updatedAt: new Date() })
        .where(eq(sources.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(sources).values(sourceData).returning();
      return created;
    }
  }

  // Chunks
  async createChunk(chunk: InsertChunk): Promise<Chunk> {
    const [created] = await db.insert(chunks).values(chunk).returning();
    return created;
  }

  async createChunks(chunkList: InsertChunk[]): Promise<Chunk[]> {
    if (chunkList.length === 0) return [];
    return db.insert(chunks).values(chunkList).returning();
  }

  async getChunksBySourceId(sourceId: string): Promise<Chunk[]> {
    return db.select().from(chunks)
      .where(eq(chunks.sourceId, sourceId))
      .orderBy(chunks.chunkIndex);
  }

  async getChunksByIds(ids: string[]): Promise<Chunk[]> {
    if (ids.length === 0) return [];
    return db.select().from(chunks).where(inArray(chunks.id, ids));
  }

  async getAllChunks(): Promise<Chunk[]> {
    return db.select().from(chunks);
  }

  /** Chunk count for workspace (optionally filtered by source IDs). Used for OOM guards. */
  async getChunkCountForWorkspace(workspaceId: string, sourceIds?: string[]): Promise<number> {
    const conditions = [eq(chunks.workspaceId, workspaceId)];
    if (sourceIds && sourceIds.length > 0) {
      conditions.push(inArray(chunks.sourceId, sourceIds));
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(chunks)
      .where(and(...conditions));
    return Number(result[0]?.count ?? 0);
  }

  /** Bounded lexical candidates for retrieval. Excludes vectorRef to avoid loading embeddings. */
  async getBoundedLexicalCandidates(
    workspaceId: string,
    sourceIds: string[],
    versionIds: string[],
    limit: number,
    queryTerms?: string[]
  ): Promise<Chunk[]> {
    if (sourceIds.length === 0 || versionIds.length === 0) return [];
    const cols = {
      id: chunks.id,
      workspaceId: chunks.workspaceId,
      userId: chunks.userId,
      sourceId: chunks.sourceId,
      sourceVersionId: chunks.sourceVersionId,
      chunkIndex: chunks.chunkIndex,
      text: chunks.text,
      charStart: chunks.charStart,
      charEnd: chunks.charEnd,
      tokenEstimate: chunks.tokenEstimate,
      metadataJson: chunks.metadataJson,
      createdAt: chunks.createdAt,
    };
    const baseConditions = and(
      eq(chunks.workspaceId, workspaceId),
      inArray(chunks.sourceId, sourceIds),
      inArray(chunks.sourceVersionId, versionIds)
    );
    if (queryTerms && queryTerms.length > 0) {
      const terms = queryTerms.filter((t) => t.length >= 2).slice(0, 5);
      if (terms.length > 0) {
        const { ilike } = await import("drizzle-orm");
        const likeConditions = terms.map((term) => ilike(chunks.text, "%" + term + "%"));
        const rows = await db
          .select(cols)
          .from(chunks)
          .where(and(baseConditions, or(...likeConditions)))
          .limit(limit);
        return rows as Chunk[];
      }
    }
    const rows = await db
      .select(cols)
      .from(chunks)
      .where(baseConditions)
      .orderBy(chunks.chunkIndex)
      .limit(limit);
    return rows as Chunk[];
  }

  // Policies
  async getPolicies(): Promise<Policy[]> {
    return db.select().from(policies).orderBy(desc(policies.createdAt));
  }

  async getActivePolicy(): Promise<Policy | undefined> {
    const [policy] = await db.select().from(policies).where(eq(policies.isActive, true));
    return policy;
  }

  async createPolicy(policy: InsertPolicy): Promise<Policy> {
    // If this policy is active, deactivate all others first
    if (policy.isActive) {
      await db.update(policies).set({ isActive: false });
    }
    const [created] = await db.insert(policies).values(policy).returning();
    return created;
  }

  async updatePolicy(id: string, updates: Partial<InsertPolicy>): Promise<Policy | undefined> {
    // If setting active, deactivate all others first
    if (updates.isActive) {
      await db.update(policies).set({ isActive: false });
    }
    const [updated] = await db.update(policies)
      .set(updates)
      .where(eq(policies.id, id))
      .returning();
    return updated;
  }

  async deletePolicy(id: string): Promise<void> {
    await db.delete(policies).where(eq(policies.id, id));
  }

  // Audit Events
  async getAuditEvents(limit = 100): Promise<AuditEvent[]> {
    return db.select().from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
  }

  async getAuditEvent(id: string): Promise<AuditEvent | undefined> {
    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.id, id));
    return event;
  }

  async getAuditEventByRequestId(requestId: string): Promise<AuditEvent | undefined> {
    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.requestId, requestId));
    return event;
  }

  async createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent> {
    const [created] = await db.insert(auditEvents).values(event).returning();
    return created;
  }

  // Approvals
  async createApproval(approval: InsertApproval): Promise<Approval> {
    const [created] = await db.insert(approvals).values(approval).returning();
    return created;
  }

  async getApproval(id: string): Promise<Approval | undefined> {
    const [approval] = await db.select().from(approvals).where(eq(approvals.id, id));
    return approval;
  }

  async getApprovalByIdempotencyKey(key: string): Promise<Approval | undefined> {
    const [approval] = await db.select().from(approvals).where(eq(approvals.idempotencyKey, key));
    return approval;
  }

  async updateApproval(id: string, updates: Partial<InsertApproval>): Promise<Approval | undefined> {
    const [updated] = await db.update(approvals)
      .set(updates)
      .where(eq(approvals.id, id))
      .returning();
    return updated;
  }

  // Eval Suites
  async getEvalSuites(): Promise<EvalSuite[]> {
    return db.select().from(evalSuites).orderBy(desc(evalSuites.createdAt));
  }

  async getEvalSuite(id: string): Promise<EvalSuite | undefined> {
    const [suite] = await db.select().from(evalSuites).where(eq(evalSuites.id, id));
    return suite;
  }

  async createEvalSuite(suite: InsertEvalSuite): Promise<EvalSuite> {
    const [created] = await db.insert(evalSuites).values(suite).returning();
    return created;
  }

  async deleteEvalSuite(id: string): Promise<void> {
    await db.delete(evalSuites).where(eq(evalSuites.id, id));
  }

  // Eval Runs
  // Eval Cases
  async getEvalCase(id: string): Promise<EvalCase | undefined> {
    const [evalCase] = await db.select().from(evalCases).where(eq(evalCases.id, id));
    return evalCase;
  }

  async getEvalCasesBySuiteId(suiteId: string): Promise<EvalCase[]> {
    return db.select().from(evalCases).where(eq(evalCases.suiteId, suiteId));
  }

  async createEvalCase(evalCase: InsertEvalCase): Promise<EvalCase> {
    const [newItem] = await db
      .insert(evalCases)
      .values(evalCase)
      .returning();
    return newItem;
  }

  async getEvalRuns(): Promise<EvalRun[]> {
    return db.select().from(evalRuns).orderBy(desc(evalRuns.createdAt));
  }

  async getEvalRunsBySuiteId(suiteId: string): Promise<EvalRun[]> {
    return db.select().from(evalRuns)
      .where(eq(evalRuns.suiteId, suiteId))
      .orderBy(desc(evalRuns.createdAt));
  }

  async getEvalRunsBySuiteIdPaginated(suiteId: string, limit: number, offset: number): Promise<EvalRun[]> {
    return db.select().from(evalRuns)
      .where(eq(evalRuns.suiteId, suiteId))
      .orderBy(desc(evalRuns.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getEvalRun(id: string): Promise<EvalRun | undefined> {
    const [run] = await db.select().from(evalRuns).where(eq(evalRuns.id, id));
    return run;
  }

  async createEvalRun(run: InsertEvalRun): Promise<EvalRun> {
    const [created] = await db.insert(evalRuns).values(run).returning();
    return created;
  }

  async updateEvalRun(id: string, updates: Partial<InsertEvalRun>): Promise<EvalRun | undefined> {
    const [updated] = await db.update(evalRuns)
      .set(updates)
      .where(eq(evalRuns.id, id))
      .returning();
    return updated;
  }

  async updateEvalSuiteBaseline(suiteId: string, baselineRunId: string | null): Promise<EvalSuite | undefined> {
    const [updated] = await db.update(evalSuites)
      .set({ baselineRunId, updatedAt: new Date() })
      .where(eq(evalSuites.id, suiteId))
      .returning();
    return updated;
  }

  async updateEvalSuiteThresholds(suiteId: string, thresholds: Record<string, unknown> | null): Promise<EvalSuite | undefined> {
    const [updated] = await db.update(evalSuites)
      .set({ thresholdsJson: thresholds, updatedAt: new Date() })
      .where(eq(evalSuites.id, suiteId))
      .returning();
    return updated;
  }

  // Eval Results
  async getEvalResults(runId: string): Promise<EvalResult[]> {
    return db.select().from(evalResults)
      .where(eq(evalResults.runId, runId))
      .orderBy(desc(evalResults.createdAt));
  }

  async getEvalResultsByRunIds(runIds: string[]): Promise<EvalResult[]> {
    if (!runIds.length) return [];
    return db.select().from(evalResults)
      .where(inArray(evalResults.runId, runIds))
      .orderBy(desc(evalResults.createdAt));
  }

  async createEvalResult(result: InsertEvalResult): Promise<EvalResult> {
    const [created] = await db.insert(evalResults).values(result).returning();
    return created;
  }


  // Jobs
  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }

  async getLatestJobByScope(scopeId: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs)
      .where(eq(jobs.scopeId, scopeId))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    return job;
  }

  async getJobByIdempotencyKey(key: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.idempotencyKey, key));
    return job;
  }

  async getPendingJobs(limit = 10): Promise<Job[]> {
    const now = new Date();
    return db.select().from(jobs)
      .where(and(
        eq(jobs.status, "pending"),
        lte(jobs.nextRunAt, now),
        isNull(jobs.lockedAt)
      ))
      .orderBy(desc(jobs.priority), jobs.nextRunAt)
      .limit(limit);
  }

  async getPendingJobCount(): Promise<number> {
    const now = new Date();
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(jobs)
      .where(and(
        eq(jobs.status, "pending"),
        lte(jobs.nextRunAt, now),
        isNull(jobs.lockedAt)
      ));
    return result[0]?.count ?? 0;
  }

  async getJobsByUser(userId: string): Promise<Job[]> {
    return db.select().from(jobs)
      .where(eq(jobs.userId, userId))
      .orderBy(desc(jobs.createdAt));
  }

  async getDeadLetterJobs(): Promise<Job[]> {
    return db.select().from(jobs)
      .where(eq(jobs.status, "dead_letter"))
      .orderBy(desc(jobs.createdAt));
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async updateJob(id: string, updates: Partial<InsertJob>): Promise<Job | undefined> {
    const [updated] = await db.update(jobs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  async lockJob(jobId: string, workerId: string): Promise<Job | undefined> {
    const now = new Date();
    const [locked] = await db.update(jobs)
      .set({ lockedAt: now, lockedBy: workerId, status: "running", updatedAt: now })
      .where(and(
        eq(jobs.id, jobId),
        eq(jobs.status, "pending"),
        isNull(jobs.lockedAt),
        lte(jobs.nextRunAt, now)
      ))
      .returning();
    return locked;
  }

  async unlockStaleJob(jobId: string, expectedWorkerId: string): Promise<boolean> {
    const now = new Date();
    const result = await db.update(jobs)
      .set({ lockedAt: null, lockedBy: null, status: "pending", updatedAt: now })
      .where(and(
        eq(jobs.id, jobId),
        eq(jobs.lockedBy, expectedWorkerId)
      ));
    return true;
  }

  async unlockJob(jobId: string): Promise<void> {
    await db.update(jobs)
      .set({ lockedAt: null, lockedBy: null, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  }

  async getStaleRunningJobs(staleThreshold: Date): Promise<Job[]> {
    return db.select().from(jobs)
      .where(and(
        eq(jobs.status, "running"),
        lte(jobs.lockedAt, staleThreshold)
      ));
  }

  // Job Runs
  async getJobRuns(jobId: string): Promise<JobRun[]> {
    return db.select().from(jobRuns)
      .where(eq(jobRuns.jobId, jobId))
      .orderBy(desc(jobRuns.createdAt));
  }

  async getLatestJobRun(jobId: string): Promise<JobRun | undefined> {
    const [run] = await db.select().from(jobRuns)
      .where(eq(jobRuns.jobId, jobId))
      .orderBy(desc(jobRuns.createdAt))
      .limit(1);
    return run;
  }

  async getLatestSyncJobForScope(scopeId: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs)
      .where(and(eq(jobs.scopeId, scopeId), eq(jobs.type, "sync")))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    return job;
  }

  async getCountsByScope(scopeId: string): Promise<{ sources: number; chunks: number }> {
    // Count sources linked to this scope via metadata
    const sourcesResult = await db.select({ count: sql<number>`count(*)::int` }).from(sources)
      .where(sql`metadata_json->>'scopeId' = ${scopeId}`);

    // Count chunks from those sources using raw SQL
    const chunksResult = await db.select({ count: sql<number>`count(*)::int` }).from(chunks)
      .where(sql`source_id IN (SELECT id FROM sources WHERE metadata_json->>'scopeId' = ${scopeId})`);

    return {
      sources: sourcesResult[0]?.count ?? 0,
      chunks: chunksResult[0]?.count ?? 0
    };
  }

  async getIngestionSummary(workspaceId?: string): Promise<{
    totalSources: number;
    totalChunks: number;
    lastSyncAt: Date | null;
    activeSyncJobs: Array<{ id: string; scopeId: string | null; connectorType: string | null; status: string }>;
  }> {
    const sourcesWhere = workspaceId ? eq(sources.workspaceId, workspaceId) : undefined;
    const chunksWhere = workspaceId ? eq(chunks.workspaceId, workspaceId) : undefined;
    const [sourcesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(sources)
      .where(sourcesWhere ?? sql`1=1`);
    const [chunksRow] = await db.select({ count: sql<number>`count(*)::int` }).from(chunks)
      .where(chunksWhere ?? sql`1=1`);
    const lastSync = await db.select({ completedAt: jobs.completedAt }).from(jobs)
      .where(and(eq(jobs.type, "sync"), eq(jobs.status, "completed")))
      .orderBy(desc(jobs.completedAt))
      .limit(1);
    const activeJobs = await db.select({
      id: jobs.id,
      scopeId: jobs.scopeId,
      connectorType: jobs.connectorType,
      status: jobs.status,
    }).from(jobs)
      .where(and(
        eq(jobs.type, "sync"),
        or(eq(jobs.status, "pending"), eq(jobs.status, "running"))
      ))
      .orderBy(desc(jobs.createdAt))
      .limit(20);
    return {
      totalSources: sourcesRow?.count ?? 0,
      totalChunks: chunksRow?.count ?? 0,
      lastSyncAt: lastSync[0]?.completedAt ?? null,
      activeSyncJobs: activeJobs.map((j: { id: string; scopeId: string | null; connectorType: string | null; status: string }) => ({ id: j.id, scopeId: j.scopeId, connectorType: j.connectorType, status: j.status })),
    };
  }

  async createJobRun(run: InsertJobRun): Promise<JobRun> {
    const [created] = await db.insert(jobRuns).values(run).returning();
    return created;
  }

  async updateJobRun(id: string, updates: Partial<InsertJobRun>): Promise<JobRun | undefined> {
    const [updated] = await db.update(jobRuns)
      .set(updates)
      .where(eq(jobRuns.id, id))
      .returning();
    return updated;
  }

  // Traces
  async getTrace(id: string): Promise<Trace | undefined> {
    const [trace] = await db.select().from(traces).where(eq(traces.id, id));
    return trace;
  }

  async getTracesByUser(userId: string, limit = 50): Promise<Trace[]> {
    return db.select().from(traces)
      .where(eq(traces.userId, userId))
      .orderBy(desc(traces.createdAt))
      .limit(limit);
  }

  async getRecentTraces(limit = 100): Promise<Trace[]> {
    return db.select().from(traces)
      .orderBy(desc(traces.createdAt))
      .limit(limit);
  }

  async createTrace(trace: InsertTrace): Promise<Trace> {
    const [created] = await db.insert(traces).values(trace).returning();
    return created;
  }

  async updateTrace(id: string, updates: Partial<InsertTrace>): Promise<Trace | undefined> {
    const [updated] = await db.update(traces)
      .set(updates)
      .where(eq(traces.id, id))
      .returning();
    return updated;
  }

  // Spans
  async getSpansByTrace(traceId: string): Promise<Span[]> {
    return db.select().from(spans)
      .where(eq(spans.traceId, traceId))
      .orderBy(spans.startedAt);
  }

  async createSpan(span: InsertSpan): Promise<Span> {
    const [created] = await db.insert(spans).values(span).returning();
    return created;
  }

  async updateSpan(id: string, updates: Partial<InsertSpan>): Promise<Span | undefined> {
    const [updated] = await db.update(spans)
      .set(updates)
      .where(eq(spans.id, id))
      .returning();
    return updated;
  }

  // Source Versions
  async getSourceVersions(sourceId: string): Promise<SourceVersion[]> {
    return db.select().from(sourceVersions)
      .where(eq(sourceVersions.sourceId, sourceId))
      .orderBy(desc(sourceVersions.version));
  }

  async getActiveSourceVersion(sourceId: string): Promise<SourceVersion | undefined> {
    const [version] = await db.select().from(sourceVersions)
      .where(and(
        eq(sourceVersions.sourceId, sourceId),
        eq(sourceVersions.isActive, true)
      ));
    return version;
  }

  async createSourceVersion(version: InsertSourceVersion): Promise<SourceVersion> {
    const [created] = await db.insert(sourceVersions).values(version).returning();
    return created;
  }

  async deactivateSourceVersions(sourceId: string): Promise<void> {
    await db.update(sourceVersions)
      .set({ isActive: false })
      .where(eq(sourceVersions.sourceId, sourceId));
  }

  // Playbooks
  async getPlaybook(id: string): Promise<Playbook | undefined> {
    const [playbook] = await db.select().from(playbooks).where(eq(playbooks.id, id));
    return playbook;
  }

  async getPlaybooksByUser(userId: string): Promise<Playbook[]> {
    return db.select().from(playbooks)
      .where(eq(playbooks.userId, userId))
      .orderBy(desc(playbooks.createdAt));
  }

  async createPlaybook(playbook: InsertPlaybook): Promise<Playbook> {
    const [created] = await db.insert(playbooks).values(playbook).returning();
    return created;
  }

  async updatePlaybook(id: string, updates: Partial<InsertPlaybook>): Promise<Playbook | undefined> {
    const [updated] = await db.update(playbooks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(playbooks.id, id))
      .returning();
    return updated;
  }

  // Playbook Items
  async getPlaybookItems(playbookId: string): Promise<PlaybookItem[]> {
    return db.select().from(playbookItems)
      .where(eq(playbookItems.playbookId, playbookId))
      .orderBy(playbookItems.orderIndex);
  }

  async createPlaybookItem(item: InsertPlaybookItem): Promise<PlaybookItem> {
    const [created] = await db.insert(playbookItems).values(item).returning();
    return created;
  }

  async updatePlaybookItem(id: string, updates: Partial<InsertPlaybookItem>): Promise<PlaybookItem | undefined> {
    const [updated] = await db.update(playbookItems)
      .set(updates)
      .where(eq(playbookItems.id, id))
      .returning();
    return updated;
  }

  // Job locking with SKIP LOCKED - atomic job claiming
  async claimJobWithLock(workerId: string, limit = 1): Promise<Job | undefined> {
    // If using pool (Postgres), connect. SQLite doesn't need explicit connect.
    if (process.env.DEBUG_JOBS === '1') {
      console.log(`[claimJobWithLock] pool defined: ${!!pool}`);
    }
    if (!pool) {
      if (process.env.DEBUG_JOBS === '1') {
        console.log('[claimJobWithLock] pool is null, returning undefined');
      }
      return undefined;
    }

    let client;
    try {
      if (process.env.DEBUG_JOBS === '1') {
        console.log('[claimJobWithLock] Connecting to pool...');
      }
      client = await pool.connect();
      if (process.env.DEBUG_JOBS === '1') {
        console.log('[claimJobWithLock] Connected, starting transaction...');
      }
      await client.query('BEGIN');

      if (process.env.DEBUG_JOBS === '1') {
        console.log(`[claimJobWithLock] Querying for pending jobs...`);
      }

      // Use NOW() directly in SQL to avoid JavaScript Date timezone issues
      const result = await client.query(
        `SELECT * FROM jobs
         WHERE status = 'pending'
         AND next_run_at <= NOW()
         AND locked_at IS NULL
         ORDER BY priority DESC, next_run_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit]
      );

      if (process.env.DEBUG_JOBS === '1') {
        console.log(`[claimJobWithLock] Query returned ${result.rows.length} rows`);
      }

      if (result.rows.length === 0) {
        await client.query('COMMIT');
        client.release();
        return undefined;
      }

      const job = result.rows[0] as any;
      if (process.env.DEBUG_JOBS === '1') {
        console.log(`[claimJobWithLock] Claiming job id=${job.id}, type=${job.type}, connector_type=${job.connector_type}`);
      }

      // Use NOW() for locking too
      await client.query(
        `UPDATE jobs SET locked_at = NOW(), locked_by = $1, status = 'running', updated_at = NOW() WHERE id = $2`,
        [workerId, job.id]
      );

      await client.query('COMMIT');
      client.release();

      const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, job.id));
      if (process.env.DEBUG_JOBS === '1') {
        console.log(`[claimJobWithLock] Successfully claimed job ${job.id}`);
      }
      return updatedJob;
    } catch (error: any) {
      console.error('[claimJobWithLock] ERROR:', error.message);
      console.error('[claimJobWithLock] Stack:', error.stack);
      if (client) {
        try {
          await client.query('ROLLBACK');
          client.release();
        } catch (releaseErr) {
          console.error('[claimJobWithLock] Error releasing client:', releaseErr);
        }
      }
      return undefined;
    }
  }

  // Concurrency control
  async getOrCreateJobLock(connectorType: string, accountId?: string): Promise<JobLock> {
    const existing = await db.select().from(jobLocks)
      .where(and(
        eq(jobLocks.connectorType, connectorType as "google" | "atlassian" | "slack" | "upload"),
        accountId ? eq(jobLocks.accountId, accountId) : isNull(jobLocks.accountId)
      ));

    if (existing.length > 0) return existing[0];

    const [created] = await db.insert(jobLocks).values({
      connectorType: connectorType as "google" | "atlassian" | "slack" | "upload",
      accountId: accountId || null,
      activeCount: 0,
      maxConcurrency: connectorType === "upload" ? 5 : 2,
      updatedAt: new Date(),
    }).returning();

    return created;
  }

  async incrementJobLockCount(lockId: string): Promise<boolean> {
    const lock = await db.select().from(jobLocks).where(eq(jobLocks.id, lockId));
    if (lock.length === 0) return false;

    if (lock[0].activeCount >= lock[0].maxConcurrency) return false;

    await db.update(jobLocks)
      .set({ activeCount: lock[0].activeCount + 1, updatedAt: new Date() })
      .where(eq(jobLocks.id, lockId));

    return true;
  }

  async decrementJobLockCount(lockId: string): Promise<void> {
    const lock = await db.select().from(jobLocks).where(eq(jobLocks.id, lockId));
    if (lock.length === 0) return;

    await db.update(jobLocks)
      .set({ activeCount: Math.max(0, lock[0].activeCount - 1), updatedAt: new Date() })
      .where(eq(jobLocks.id, lockId));
  }

  async canAcquireConcurrencySlot(connectorType: string, accountId?: string): Promise<boolean> {
    const lock = await this.getOrCreateJobLock(connectorType, accountId);
    return lock.activeCount < lock.maxConcurrency;
  }

  // Rate limiting - token bucket
  async getOrCreateRateLimitBucket(accountId: string, connectorType: string): Promise<RateLimitBucket> {
    const existing = await db.select().from(rateLimitBuckets)
      .where(and(
        eq(rateLimitBuckets.accountId, accountId),
        eq(rateLimitBuckets.connectorType, connectorType as "google" | "atlassian" | "slack" | "upload")
      ));

    if (existing.length > 0) {
      const bucket = existing[0];
      const now = Date.now();
      const lastRefillTime = new Date(bucket.lastRefill).getTime();
      const secondsElapsed = Math.floor((now - lastRefillTime) / 1000);

      if (secondsElapsed > 0) {
        const tokensToAdd = Math.min(secondsElapsed * bucket.refillRate, bucket.maxTokens - bucket.tokens);
        if (tokensToAdd > 0) {
          const [updated] = await db.update(rateLimitBuckets)
            .set({
              tokens: bucket.tokens + tokensToAdd,
              lastRefill: new Date(),
              updatedAt: new Date()
            })
            .where(eq(rateLimitBuckets.id, bucket.id))
            .returning();
          return updated;
        }
      }
      return bucket;
    }

    const maxTokens = connectorType === "upload" ? 20 : 10;
    const [created] = await db.insert(rateLimitBuckets).values({
      accountId,
      connectorType: connectorType as "google" | "atlassian" | "slack" | "upload",
      tokens: maxTokens,
      maxTokens,
      refillRate: connectorType === "upload" ? 2 : 1,
      lastRefill: new Date(),
      updatedAt: new Date(),
    }).returning();

    return created;
  }

  async consumeRateLimitToken(accountId: string, connectorType: string): Promise<boolean> {
    const bucket = await this.getOrCreateRateLimitBucket(accountId, connectorType);

    if (bucket.tokens <= 0) return false;

    await db.update(rateLimitBuckets)
      .set({ tokens: bucket.tokens - 1, updatedAt: new Date() })
      .where(eq(rateLimitBuckets.id, bucket.id));

    return true;
  }

  // Active chunks retrieval (respecting source versioning)
  async getActiveChunkCount(): Promise<number> {
    const activeVersionIds = await db.select({ id: sourceVersions.id })
      .from(sourceVersions)
      .where(eq(sourceVersions.isActive, true));

    if (activeVersionIds.length === 0) {
      const legacyOnly = await db.select({ count: sql<number>`count(*)` }).from(chunks).where(isNull(chunks.sourceVersionId));
      return Number(legacyOnly[0]?.count ?? 0);
    }

    const versionIds = activeVersionIds.map((v: { id: string }) => v.id);
    const [activeCountRow] = await db.select({ count: sql<number>`count(*)` }).from(chunks)
      .where(inArray(chunks.sourceVersionId, versionIds));
    const [legacyCountRow] = await db.select({ count: sql<number>`count(*)` }).from(chunks)
      .where(isNull(chunks.sourceVersionId));
    return Number(activeCountRow?.count ?? 0) + Number(legacyCountRow?.count ?? 0);
  }

  async getActiveChunksBounded(limit: number): Promise<Chunk[]> {
    if (limit <= 0) return [];
    const cols = {
      id: chunks.id,
      workspaceId: chunks.workspaceId,
      userId: chunks.userId,
      sourceId: chunks.sourceId,
      sourceVersionId: chunks.sourceVersionId,
      chunkIndex: chunks.chunkIndex,
      text: chunks.text,
      charStart: chunks.charStart,
      charEnd: chunks.charEnd,
      tokenEstimate: chunks.tokenEstimate,
      metadataJson: chunks.metadataJson,
      createdAt: chunks.createdAt,
    };
    const activeVersionIds = await db.select({ id: sourceVersions.id })
      .from(sourceVersions)
      .where(eq(sourceVersions.isActive, true));

    if (activeVersionIds.length === 0) {
      const legacyOnly = await db.select(cols).from(chunks)
        .where(isNull(chunks.sourceVersionId))
        .limit(limit);
      return legacyOnly as Chunk[];
    }

    const versionIds = activeVersionIds.map((v: { id: string }) => v.id);
    const activeChunks = await db.select(cols).from(chunks)
      .where(inArray(chunks.sourceVersionId, versionIds))
      .limit(limit);

    if (activeChunks.length >= limit) {
      return activeChunks as Chunk[];
    }

    const remaining = limit - activeChunks.length;
    const legacyChunks = await db.select(cols).from(chunks)
      .where(isNull(chunks.sourceVersionId))
      .limit(remaining);

    return [...(activeChunks as Chunk[]), ...(legacyChunks as Chunk[])];
  }

  async getActiveChunks(): Promise<Chunk[]> {
    const activeVersionIds = await db.select({ id: sourceVersions.id })
      .from(sourceVersions)
      .where(eq(sourceVersions.isActive, true));

    if (activeVersionIds.length === 0) {
      return db.select().from(chunks).where(isNull(chunks.sourceVersionId));
    }

    const versionIds = activeVersionIds.map((v: { id: string }) => v.id);

    const activeChunks = await db.select().from(chunks)
      .where(inArray(chunks.sourceVersionId, versionIds));

    const legacyChunks = await db.select().from(chunks)
      .where(isNull(chunks.sourceVersionId));

    return [...activeChunks, ...legacyChunks];
  }

  async getActiveChunksByUser(userId: string): Promise<Chunk[]> {
    const activeVersionIds = await db.select({ id: sourceVersions.id })
      .from(sourceVersions)
      .where(eq(sourceVersions.isActive, true));

    if (activeVersionIds.length === 0) {
      return db.select().from(chunks)
        .where(and(eq(chunks.userId, userId), isNull(chunks.sourceVersionId)));
    }

    const versionIds = activeVersionIds.map((v: { id: string }) => v.id);

    const activeChunks = await db.select().from(chunks)
      .where(and(eq(chunks.userId, userId), inArray(chunks.sourceVersionId, versionIds)));

    const legacyChunks = await db.select().from(chunks)
      .where(and(eq(chunks.userId, userId), isNull(chunks.sourceVersionId)));

    return [...activeChunks, ...legacyChunks];
  }

  async getChunk(id: string): Promise<Chunk | undefined> {
    const [chunk] = await db.select().from(chunks).where(eq(chunks.id, id));
    return chunk;
  }

  async updateChunk(id: string, updates: Partial<InsertChunk>): Promise<Chunk | undefined> {
    const [updated] = await db.update(chunks)
      .set(updates)
      .where(eq(chunks.id, id))
      .returning();
    return updated;
  }

  // Voice Calls
  async createVoiceCall(call: InsertVoiceCall): Promise<VoiceCall> {
    const [created] = await db.insert(voiceCalls).values(call).returning();
    return created;
  }

  async getVoiceCall(id: string): Promise<VoiceCall | undefined> {
    const [call] = await db.select().from(voiceCalls).where(eq(voiceCalls.id, id));
    return call;
  }

  async updateVoiceCall(id: string, updates: Partial<InsertVoiceCall>): Promise<VoiceCall | undefined> {
    const [updated] = await db.update(voiceCalls)
      .set(updates)
      .where(eq(voiceCalls.id, id))
      .returning();
    return updated;
  }

  async getVoiceCallsByUser(userId: string): Promise<VoiceCall[]> {
    return await db.select().from(voiceCalls)
      .where(eq(voiceCalls.userId, userId))
      .orderBy(desc(voiceCalls.startedAt));
  }

  // Voice Turns
  async createVoiceTurn(turn: InsertVoiceTurn): Promise<VoiceTurn> {
    const [created] = await db.insert(voiceTurns).values(turn).returning();
    return created;
  }

  async getVoiceTurnsByCall(callId: string): Promise<VoiceTurn[]> {
    return await db.select().from(voiceTurns)
      .where(eq(voiceTurns.callId, callId))
      .orderBy(voiceTurns.createdAt);
  }

  // Conversations
  async getConversations(userId: string): Promise<Conversation[]> {
    return await db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  }

  async getAdminConversations(filters?: ChatQualityFilters, page = 1, pageSize = 20): Promise<AdminConversationListResult> {
    const conditions = [];
    if (filters?.dateFrom) conditions.push(gte(conversations.createdAt, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(conversations.createdAt, filters.dateTo));
    if (filters?.environment) conditions.push(eq(conversations.environment, filters.environment as any));
    if (filters?.model) conditions.push(eq(conversations.model, filters.model));

    const query = db.select().from(conversations);
    const filtered = conditions.length ? query.where(and(...conditions)) : query;
    const allRows = await filtered.orderBy(desc(conversations.createdAt));
    const total = allRows.length;
    const start = Math.max(0, (page - 1) * pageSize);
    const rows = allRows.slice(start, start + pageSize);
    return { rows, total };
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async createConversation(userId: string, title?: string, id?: string): Promise<Conversation> {
    const values: any = { userId, title: title || "New Chat" };
    if (id) values.id = id;
    const [created] = await db.insert(conversations).values(values).returning();
    return created;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation> {
    const [updated] = await db.update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return updated;
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // Messages
  async getMessages(conversationId: string): Promise<Message[]> {
    return await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();

    // Update conversation updatedAt
    await db.update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, message.conversationId));

    return created;
  }

  async updateMessageMetadata(id: string, metadataJson: object): Promise<void> {
    await db.update(messages).set({ metadataJson }).where(eq(messages.id, id));
  }

  async createChatReply(reply: InsertChatReply): Promise<ChatReply> {
    const [created] = await db.insert(chatReplies).values(reply).returning();
    return created;
  }

  async getChatReply(id: string): Promise<ChatReply | undefined> {
    const [row] = await db.select().from(chatReplies).where(eq(chatReplies.id, id));
    return row;
  }

  async getChatReplyByMessageId(messageId: string): Promise<ChatReply | undefined> {
    const [row] = await db.select().from(chatReplies).where(eq(chatReplies.messageId, messageId));
    return row;
  }

  async getChatRepliesByChat(chatId: string): Promise<ChatReply[]> {
    return await db.select().from(chatReplies).where(eq(chatReplies.chatId, chatId)).orderBy(chatReplies.createdAt);
  }

  async updateChatReply(id: string, updates: Partial<InsertChatReply>): Promise<ChatReply | undefined> {
    const [updated] = await db.update(chatReplies).set(updates).where(eq(chatReplies.id, id)).returning();
    return updated;
  }

  async createRetrievalArtifact(artifact: InsertReplyRetrievalArtifact): Promise<ReplyRetrievalArtifact> {
    const existing = await this.getRetrievalArtifact(artifact.replyId);
    if (existing) {
      const [updated] = await db.update(replyRetrievalArtifacts)
        .set({
          retrievalMode: artifact.retrievalMode,
          topK: artifact.topK,
          chunksReturnedCount: artifact.chunksReturnedCount,
          sourcesReturnedCount: artifact.sourcesReturnedCount,
          topSimilarity: artifact.topSimilarity,
          retrievalLatencyMs: artifact.retrievalLatencyMs,
          retrievedChunksJson: artifact.retrievedChunksJson,
          dedupStatsJson: artifact.dedupStatsJson,
        })
        .where(eq(replyRetrievalArtifacts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(replyRetrievalArtifacts).values(artifact).returning();
    return created;
  }

  async getRetrievalArtifact(replyId: string): Promise<ReplyRetrievalArtifact | undefined> {
    const [row] = await db.select().from(replyRetrievalArtifacts).where(eq(replyRetrievalArtifacts.replyId, replyId));
    return row;
  }

  async createCitationArtifact(artifact: InsertReplyCitationArtifact): Promise<ReplyCitationArtifact> {
    const existing = await this.getCitationArtifact(artifact.replyId);
    if (existing) {
      const [updated] = await db.update(replyCitationArtifacts)
        .set({
          citationsJson: artifact.citationsJson,
          citationCoverageRate: artifact.citationCoverageRate,
          citationIntegrityRate: artifact.citationIntegrityRate,
          citationMisattributionRate: artifact.citationMisattributionRate,
          repairApplied: artifact.repairApplied,
          repairNotesJson: artifact.repairNotesJson,
        })
        .where(eq(replyCitationArtifacts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(replyCitationArtifacts).values(artifact).returning();
    return created;
  }

  async getCitationArtifact(replyId: string): Promise<ReplyCitationArtifact | undefined> {
    const [row] = await db.select().from(replyCitationArtifacts).where(eq(replyCitationArtifacts.replyId, replyId));
    return row;
  }

  async createEvalArtifact(artifact: InsertReplyLlmEvalArtifact): Promise<ReplyLlmEvalArtifact> {
    const existing = await this.getEvalArtifact(artifact.replyId);
    if (existing) {
      const [updated] = await db.update(replyLlmEvalArtifacts)
        .set({
          claimsJson: artifact.claimsJson,
          claimLabelsJson: artifact.claimLabelsJson,
          groundedClaimRate: artifact.groundedClaimRate,
          unsupportedClaimRate: artifact.unsupportedClaimRate,
          contradictionRate: artifact.contradictionRate,
          completenessScore: artifact.completenessScore,
          missingPointsJson: artifact.missingPointsJson,
          answerRelevanceScore: artifact.answerRelevanceScore,
          contextRelevanceScore: artifact.contextRelevanceScore,
          contextRecallScore: artifact.contextRecallScore,
          lowEvidenceCalibrationJson: artifact.lowEvidenceCalibrationJson,
          formatValidRate: artifact.formatValidRate,
          judgeModel: artifact.judgeModel,
          judgeVersion: artifact.judgeVersion,
          judgeRationalesJson: artifact.judgeRationalesJson,
        })
        .where(eq(replyLlmEvalArtifacts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(replyLlmEvalArtifacts).values(artifact).returning();
    return created;
  }

  async getEvalArtifact(replyId: string): Promise<ReplyLlmEvalArtifact | undefined> {
    const [row] = await db.select().from(replyLlmEvalArtifacts).where(eq(replyLlmEvalArtifacts.replyId, replyId));
    return row;
  }

  async createToolArtifact(artifact: InsertReplyToolArtifact): Promise<ReplyToolArtifact> {
    const existing = await this.getToolArtifact(artifact.replyId);
    if (existing) {
      const [updated] = await db.update(replyToolArtifacts)
        .set({
          toolCallsJson: artifact.toolCallsJson,
          toolSelectionAccuracy: artifact.toolSelectionAccuracy,
          parameterCorrectness: artifact.parameterCorrectness,
          idempotencyKey: artifact.idempotencyKey,
          duplicateActionDetected: artifact.duplicateActionDetected,
          retryCount: artifact.retryCount,
        })
        .where(eq(replyToolArtifacts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(replyToolArtifacts).values(artifact).returning();
    return created;
  }

  async getToolArtifact(replyId: string): Promise<ReplyToolArtifact | undefined> {
    const [row] = await db.select().from(replyToolArtifacts).where(eq(replyToolArtifacts.replyId, replyId));
    return row;
  }

  async createEnterpriseEvalArtifact(artifact: InsertEnterpriseEvalArtifact): Promise<EnterpriseEvalArtifact> {
    if (artifact.replyId) {
      const existing = await this.getEnterpriseEvalArtifact(artifact.replyId);
      if (existing) {
        const [updated] = await db.update(enterpriseEvalArtifacts)
          .set(artifact)
          .where(eq(enterpriseEvalArtifacts.id, existing.id))
          .returning();
        return updated;
      }
    }
    const [created] = await db.insert(enterpriseEvalArtifacts).values(artifact).returning();
    return created;
  }

  async getEnterpriseEvalArtifact(replyId: string): Promise<EnterpriseEvalArtifact | undefined> {
    const [row] = await db.select()
      .from(enterpriseEvalArtifacts)
      .where(eq(enterpriseEvalArtifacts.replyId, replyId))
      .orderBy(desc(enterpriseEvalArtifacts.createdAt))
      .limit(1);
    return row;
  }

  async getEnterpriseEvalArtifactsByRunId(runId: string): Promise<EnterpriseEvalArtifact[]> {
    return db.select()
      .from(enterpriseEvalArtifacts)
      .where(eq(enterpriseEvalArtifacts.runId, runId))
      .orderBy(desc(enterpriseEvalArtifacts.createdAt));
  }

  private async getFilteredChatIds(filters?: ChatQualityFilters): Promise<string[]> {
    const conditions = [];
    if (filters?.dateFrom) conditions.push(gte(conversations.createdAt, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(conversations.createdAt, filters.dateTo));
    if (filters?.environment) conditions.push(eq(conversations.environment, filters.environment as any));
    if (filters?.model) conditions.push(eq(conversations.model, filters.model));

    const rows = conditions.length
      ? await db.select({ id: conversations.id }).from(conversations).where(and(...conditions))
      : await db.select({ id: conversations.id }).from(conversations);
    return rows.map((r: { id: string }) => r.id);
  }

  async getChatQualityOverview(filters?: ChatQualityFilters): Promise<ChatQualityOverview> {
    const chatIds = await this.getFilteredChatIds(filters);
    if (!chatIds.length) {
      return {
        chatCount: 0,
        replyCount: 0,
        successRate: 0,
        avgLatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p95TtftMs: 0,
        avgTokens: 0,
        p95Tokens: 0,
        totalCostUsd: 0,
        avgUnsupportedClaimRate: 0,
        p95UnsupportedClaimRate: 0,
        avgCitationIntegrityRate: 0,
        toolFailureRate: 0,
        lowEvidenceFailuresCount: 0,
        contradictionHandlingFailuresCount: 0,
        enterpriseOverallPassRate: 0,
        enterpriseCitationUiReadinessRate: 0,
        enterpriseHallucinationAvoidanceRate: 0,
        enterpriseStabilityPassRate: 0,
      };
    }

    let replyRows = await db.select().from(chatReplies).where(inArray(chatReplies.chatId, chatIds));
    if (filters?.status) {
      replyRows = replyRows.filter((r: ChatReply) => r.status === filters.status);
    }

    if (!replyRows.length) {
      return {
        chatCount: chatIds.length,
        replyCount: 0,
        successRate: 0,
        avgLatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p95TtftMs: 0,
        avgTokens: 0,
        p95Tokens: 0,
        totalCostUsd: 0,
        avgUnsupportedClaimRate: 0,
        p95UnsupportedClaimRate: 0,
        avgCitationIntegrityRate: 0,
        toolFailureRate: 0,
        lowEvidenceFailuresCount: 0,
        contradictionHandlingFailuresCount: 0,
        enterpriseOverallPassRate: 0,
        enterpriseCitationUiReadinessRate: 0,
        enterpriseHallucinationAvoidanceRate: 0,
        enterpriseStabilityPassRate: 0,
      };
    }

    const replyIds = replyRows.map((r: ChatReply) => r.id);
    const evalRows = await db.select().from(replyLlmEvalArtifacts).where(inArray(replyLlmEvalArtifacts.replyId, replyIds)) as ReplyLlmEvalArtifact[];
    const citationRows = await db.select().from(replyCitationArtifacts).where(inArray(replyCitationArtifacts.replyId, replyIds)) as ReplyCitationArtifact[];
    const toolRows = await db.select().from(replyToolArtifacts).where(inArray(replyToolArtifacts.replyId, replyIds)) as ReplyToolArtifact[];

    const evalByReply: Map<string, ReplyLlmEvalArtifact> = new Map(evalRows.map((r: ReplyLlmEvalArtifact) => [r.replyId, r]));
    const citationByReply: Map<string, ReplyCitationArtifact> = new Map(citationRows.map((r: ReplyCitationArtifact) => [r.replyId, r]));
    const toolByReply: Map<string, ReplyToolArtifact> = new Map(toolRows.map((r: ReplyToolArtifact) => [r.replyId, r]));
    const enterpriseRows = await db.select().from(enterpriseEvalArtifacts).where(inArray(enterpriseEvalArtifacts.replyId, replyIds));
    const enterpriseByReply: Map<string, EnterpriseEvalArtifact> = new Map(
      enterpriseRows
        .filter((r: EnterpriseEvalArtifact) => Boolean(r.replyId))
        .map((r: EnterpriseEvalArtifact) => [r.replyId as string, r])
    );

    if (filters?.needsReview || filters?.hasRegressions) {
      replyRows = replyRows.filter((reply: ChatReply) => {
        const evalRow = evalByReply.get(reply.id);
        const citationRow = citationByReply.get(reply.id);
        const toolRow = toolByReply.get(reply.id);
        const needsReview =
          reply.status === "error" ||
          (evalRow?.unsupportedClaimRate ?? 0) > 0.2 ||
          (citationRow?.citationIntegrityRate ?? 1) < 0.8 ||
          (toolRow ? ((toolRow.toolCallsJson as any[]) || []).some((c: any) => c?.status === "failed" || c?.success === false) : false);
        const hasRegression =
          (evalRow?.unsupportedClaimRate ?? 0) > 0.2 ||
          (citationRow?.citationIntegrityRate ?? 1) < 0.8 ||
          reply.status === "error";
        if (filters.needsReview && !needsReview) return false;
        if (filters.hasRegressions && !hasRegression) return false;
        return true;
      });
    }

    const latencies = replyRows.map((r: ChatReply) => r.latencyMs ?? 0).filter((v: number) => Number.isFinite(v) && v >= 0);
    const ttfts = replyRows.map((r: ChatReply) => r.ttftMs ?? 0).filter((v: number) => Number.isFinite(v) && v >= 0);
    const tokenTotals = replyRows.map((r: ChatReply) => (r.tokensIn ?? 0) + (r.tokensOut ?? 0));
    const costs = replyRows.map((r: ChatReply) => r.costUsd ?? 0);
    const unsupported = replyRows.map((r: ChatReply) => evalByReply.get(r.id)?.unsupportedClaimRate ?? 0);
    const integrity = replyRows.map((r: ChatReply) => citationByReply.get(r.id)?.citationIntegrityRate ?? 0);
    const successful = replyRows.filter((r: ChatReply) => r.status === "ok").length;
    const lowEvidenceFailures = evalRows.filter((r: ReplyLlmEvalArtifact) => {
      const val = r.lowEvidenceCalibrationJson as any;
      if (!val) return false;
      if (typeof val === "object" && val !== null && "pass" in val) return !Boolean((val as any).pass);
      if (typeof val === "string") return val.toLowerCase().includes("fail");
      return false;
    }).length;
    const contradictionFailures = evalRows.filter((r: ReplyLlmEvalArtifact) => (r.contradictionRate ?? 0) > 0).length;
    const toolCalls = toolRows.flatMap((r: ReplyToolArtifact) => ((r.toolCallsJson as any[]) || []));
    const toolFailures = toolCalls.filter((c: any) => c?.status === "failed" || c?.success === false).length;
    const enterpriseValues = replyRows.map((r: ChatReply) => enterpriseByReply.get(r.id)).filter(Boolean) as EnterpriseEvalArtifact[];
    const enterpriseOverallPassRate = enterpriseValues.length
      ? enterpriseValues.filter((r) => Boolean(r.overallPass)).length / enterpriseValues.length
      : 0;
    const enterpriseCitationUiReadinessRate = avg(
      enterpriseValues.map((r) => r.citationUiReadinessScore ?? 0)
    );
    const enterpriseHallucinationAvoidanceRate = enterpriseValues.length
      ? enterpriseValues.filter((r) => Boolean(r.missingDataHallucinationPass)).length / enterpriseValues.length
      : 0;
    const enterpriseStabilityPassRate = enterpriseValues.length
      ? enterpriseValues.filter((r) => Boolean(r.stabilityPass)).length / enterpriseValues.length
      : 0;

    return {
      chatCount: new Set(replyRows.map((r: ChatReply) => r.chatId)).size,
      replyCount: replyRows.length,
      successRate: replyRows.length ? successful / replyRows.length : 0,
      avgLatencyMs: avg(latencies),
      minLatencyMs: min(latencies),
      maxLatencyMs: max(latencies),
      p50LatencyMs: computePercentile(latencies, 50),
      p95LatencyMs: computePercentile(latencies, 95),
      p95TtftMs: computePercentile(ttfts, 95),
      avgTokens: avg(tokenTotals),
      p95Tokens: computePercentile(tokenTotals, 95),
      totalCostUsd: costs.reduce((sum: number, value: number) => sum + value, 0),
      avgUnsupportedClaimRate: avg(unsupported),
      p95UnsupportedClaimRate: computePercentile(unsupported, 95),
      avgCitationIntegrityRate: avg(integrity),
      toolFailureRate: toolCalls.length ? toolFailures / toolCalls.length : 0,
      lowEvidenceFailuresCount: lowEvidenceFailures,
      contradictionHandlingFailuresCount: contradictionFailures,
      enterpriseOverallPassRate,
      enterpriseCitationUiReadinessRate,
      enterpriseHallucinationAvoidanceRate,
      enterpriseStabilityPassRate,
    };
  }

  async getChatQualityTimeseries(filters?: ChatQualityFilters): Promise<ChatQualityTimeseriesPoint[]> {
    const chatIds = await this.getFilteredChatIds(filters);
    if (!chatIds.length) return [];

    let replies = await db.select().from(chatReplies).where(inArray(chatReplies.chatId, chatIds));
    if (filters?.status) replies = replies.filter((r: ChatReply) => r.status === filters.status);
    if (!replies.length) return [];

    const replyIds = replies.map((r: ChatReply) => r.id);
    const evalRows = await db.select().from(replyLlmEvalArtifacts).where(inArray(replyLlmEvalArtifacts.replyId, replyIds)) as ReplyLlmEvalArtifact[];
    const citationRows = await db.select().from(replyCitationArtifacts).where(inArray(replyCitationArtifacts.replyId, replyIds)) as ReplyCitationArtifact[];
    const evalByReply: Map<string, ReplyLlmEvalArtifact> = new Map(evalRows.map((r: ReplyLlmEvalArtifact) => [r.replyId, r]));
    const citationByReply: Map<string, ReplyCitationArtifact> = new Map(citationRows.map((r: ReplyCitationArtifact) => [r.replyId, r]));

    const buckets = new Map<string, ChatReply[]>();
    for (const reply of replies) {
      const date = reply.createdAt ? new Date(reply.createdAt) : new Date();
      const bucket = `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}-${`${date.getUTCDate()}`.padStart(2, "0")}`;
      const arr = buckets.get(bucket) ?? [];
      arr.push(reply);
      buckets.set(bucket, arr);
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, rows]) => {
        const latencies = rows.map((r: ChatReply) => r.latencyMs ?? 0);
        const successRate = rows.length ? rows.filter((r: ChatReply) => r.status === "ok").length / rows.length : 0;
        const unsupportedClaimRate = avg(rows.map((r: ChatReply) => evalByReply.get(r.id)?.unsupportedClaimRate ?? 0));
        const citationIntegrityRate = avg(rows.map((r: ChatReply) => citationByReply.get(r.id)?.citationIntegrityRate ?? 0));
        return {
          bucket,
          successRate,
          p95LatencyMs: computePercentile(latencies, 95),
          unsupportedClaimRate,
          citationIntegrityRate,
        };
      });
  }
}

export const storage = new DatabaseStorage();
