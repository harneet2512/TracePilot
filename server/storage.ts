import { db } from "./db";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  users, sessions, connectors, userConnectorAccounts, userConnectorScopes,
  sources, chunks, policies, auditEvents, approvals, evalSuites, evalRuns,
  type User, type InsertUser, type Session, type InsertSession,
  type Connector, type InsertConnector,
  type UserConnectorAccount, type InsertUserConnectorAccount,
  type UserConnectorScope, type InsertUserConnectorScope,
  type Source, type InsertSource,
  type Chunk, type InsertChunk, type Policy, type InsertPolicy,
  type AuditEvent, type InsertAuditEvent, type Approval, type InsertApproval,
  type EvalSuite, type InsertEvalSuite, type EvalRun, type InsertEvalRun
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
  createSource(source: InsertSource): Promise<Source>;
  deleteSource(id: string): Promise<void>;
  
  // Chunks
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
  
  // Eval Suites
  getEvalSuites(): Promise<EvalSuite[]>;
  getEvalSuite(id: string): Promise<EvalSuite | undefined>;
  createEvalSuite(suite: InsertEvalSuite): Promise<EvalSuite>;
  deleteEvalSuite(id: string): Promise<void>;
  
  // Eval Runs
  getEvalRuns(): Promise<EvalRun[]>;
  getEvalRunsBySuiteId(suiteId: string): Promise<EvalRun[]>;
  createEvalRun(run: InsertEvalRun): Promise<EvalRun>;
  updateEvalRun(id: string, updates: Partial<InsertEvalRun>): Promise<EvalRun | undefined>;
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

  async createSource(source: InsertSource): Promise<Source> {
    const [created] = await db.insert(sources).values(source).returning();
    return created;
  }

  async deleteSource(id: string): Promise<void> {
    await db.delete(sources).where(eq(sources.id, id));
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
  async getEvalRuns(): Promise<EvalRun[]> {
    return db.select().from(evalRuns).orderBy(desc(evalRuns.createdAt));
  }

  async getEvalRunsBySuiteId(suiteId: string): Promise<EvalRun[]> {
    return db.select().from(evalRuns)
      .where(eq(evalRuns.suiteId, suiteId))
      .orderBy(desc(evalRuns.createdAt));
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
}

export const storage = new DatabaseStorage();
