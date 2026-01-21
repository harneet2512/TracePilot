import { db as _db, pool } from "./db";
const db = _db as any; // Bypass Drizzle strict union check for cross-dialect compatibility
import { eq, desc, and, inArray, lte, isNull, sql, gt } from "drizzle-orm";
import {
  users, sessions, connectors, userConnectorAccounts, userConnectorScopes,
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
  type VoiceCall, type InsertVoiceCall, type VoiceTurn, type InsertVoiceTurn
} from "@shared/schema";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

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
  createEvalRun(run: InsertEvalRun): Promise<EvalRun>;
  updateEvalRun(id: string, updates: Partial<InsertEvalRun>): Promise<EvalRun | undefined>;

  // Eval Results
  getEvalResults(runId: string): Promise<EvalResult[]>;
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
  getActiveChunks(): Promise<Chunk[]>;
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
    const user = await this.getUserByEmail(email);
    if (!user || !user.passwordHash) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
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

  // Eval Results
  async getEvalResults(runId: string): Promise<EvalResult[]> {
    return db.select().from(evalResults)
      .where(eq(evalResults.runId, runId))
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
    console.log(`[claimJobWithLock] pool defined: ${!!pool}`);
    if (!pool) {
      console.log('[claimJobWithLock] pool is null, returning undefined');
      return undefined;
    }

    let client;
    try {
      console.log('[claimJobWithLock] Connecting to pool...');
      client = await pool.connect();
      console.log('[claimJobWithLock] Connected, starting transaction...');
      await client.query('BEGIN');

      console.log(`[claimJobWithLock] Querying for pending jobs...`);

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

      console.log(`[claimJobWithLock] Query returned ${result.rows.length} rows`);

      if (result.rows.length === 0) {
        await client.query('COMMIT');
        client.release();
        return undefined;
      }

      const job = result.rows[0] as any;
      console.log(`[claimJobWithLock] Claiming job id=${job.id}, type=${job.type}, connector_type=${job.connector_type}`);

      // Use NOW() for locking too
      await client.query(
        `UPDATE jobs SET locked_at = NOW(), locked_by = $1, status = 'running', updated_at = NOW() WHERE id = $2`,
        [workerId, job.id]
      );

      await client.query('COMMIT');
      client.release();

      const [updatedJob] = await db.select().from(jobs).where(eq(jobs.id, job.id));
      console.log(`[claimJobWithLock] Successfully claimed job ${job.id}`);
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
}

export const storage = new DatabaseStorage();
