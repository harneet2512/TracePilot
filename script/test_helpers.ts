import { db } from "../server/db";
import { storage } from "../server/storage";
import { eq, and, desc } from "drizzle-orm";
import { 
  users, voiceCalls, voiceTurns, jobs, jobRuns, sources, sourceVersions, 
  chunks, traces, spans, approvals, sourceVersions as sourceVersionsTable
} from "@shared/schema";
import type { WebSocket } from "ws";
import type { User, VoiceCall, VoiceTurn, Job, JobRun, Source, SourceVersion, Chunk, Trace, Span } from "@shared/schema";

export interface TestResult {
  testId: string;
  name: string;
  passed: boolean;
  error?: string;
  metrics?: Record<string, number>;
}

export class TestHelpers {
  private testUserId: string | null = null;
  private testSourceIds: string[] = [];
  private testCallIds: string[] = [];

  async createTestUser(): Promise<User> {
    const email = `test-${Date.now()}@example.com`;
    const password = "test-password-123";
    
    const user = await storage.createUser({
      email,
      passwordHash: await import("bcrypt").then(b => b.default.hash(password, 10)),
      role: "member",
    });
    
    this.testUserId = user.id;
    return user;
  }

  async getOrCreateTestUser(): Promise<User> {
    if (this.testUserId) {
      const user = await storage.getUser(this.testUserId);
      if (user) return user;
    }
    return await this.createTestUser();
  }

  async waitForWebSocketMessage(
    ws: WebSocket,
    expectedType: string,
    timeoutMs: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.removeAllListeners("message");
        reject(new Error(`Timeout waiting for message type: ${expectedType}`));
      }, timeoutMs);

      const handler = (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === expectedType) {
            clearTimeout(timeout);
            ws.removeAllListeners("message");
            resolve(message);
          }
        } catch (e) {
          // Continue waiting
        }
      };

      ws.on("message", handler);
    });
  }

  async waitForJobCompletion(
    jobId: string,
    timeoutMs: number = 30000
  ): Promise<JobRun> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const job = await storage.getJob(jobId);
      if (job?.status === "completed" || job?.status === "failed" || job?.status === "dead_letter") {
        const runs = await storage.getJobRuns(jobId);
        if (runs.length > 0) {
          return runs[runs.length - 1];
        }
        throw new Error(`Job ${jobId} completed but no runs found`);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    throw new Error(`Timeout waiting for job ${jobId} to complete`);
  }

  async getSpansForTrace(traceId: string): Promise<Span[]> {
    return await storage.getSpansByTrace(traceId);
  }
  
  async getSpansByTrace(traceId: string): Promise<Span[]> {
    return await storage.getSpansByTrace(traceId);
  }

  async getSpansForCall(callId: string): Promise<Span[]> {
    const call = await storage.getVoiceCall(callId);
    if (!call) return [];
    
    const turns = await storage.getVoiceTurnsByCall(callId);
    const traceIds = turns
      .map(t => t.traceId)
      .filter((id): id is string => id !== null);
    
    if (traceIds.length === 0) return [];
    
    // Get all spans for all traces
    const allSpans: Span[] = [];
    for (const traceId of traceIds) {
      const spans = await this.getSpansForTrace(traceId);
      allSpans.push(...spans);
    }
    
    return allSpans;
  }

  async createTestSourceWithVersions(
    content: string,
    versionCount: number = 2,
    makeLastActive: boolean = true
  ): Promise<{ sourceId: string; versionIds: string[] }> {
    const user = await this.getOrCreateTestUser();
    
    const createHash = (await import("crypto")).createHash;
    const contentHash = createHash("sha256").update(content).digest("hex");
    
    // Create source
    const source = await storage.createSource({
      type: "upload",
      title: `test-source-${Date.now()}`,
      contentHash,
      fullText: content,
      userId: user.id,
    });
    
    this.testSourceIds.push(source.id);
    
    const versionIds: string[] = [];
    
    // Create versions
    for (let i = 0; i < versionCount; i++) {
      const versionContent = i === versionCount - 1 && makeLastActive 
        ? content 
        : `${content} (version ${i + 1})`;
      const versionHash = createHash("sha256").update(versionContent).digest("hex");
      
      if (i > 0) {
        // Deactivate previous versions
        await storage.deactivateSourceVersions(source.id);
      }
      
      const version = await storage.createSourceVersion({
        sourceId: source.id,
        version: i + 1,
        contentHash: versionHash,
        fullText: versionContent,
        isActive: i === versionCount - 1 ? makeLastActive : false,
        charCount: versionContent.length,
        tokenEstimate: Math.ceil(versionContent.length / 4),
      });
      
      versionIds.push(version.id);
    }
    
    return { sourceId: source.id, versionIds };
  }

  measureLatency(startTime: number, endTime: number): number {
    return endTime - startTime;
  }

  async createWebSocketConnection(
    url: string,
    userId?: string
  ): Promise<WebSocket> {
    const { WebSocket: WebSocketClass } = await import("ws");
    const wsUrl = userId ? `${url}?userId=${userId}` : url;
    const ws = new WebSocketClass(wsUrl);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 5000);
      
      ws.on("open", () => {
        clearTimeout(timeout);
        resolve(ws);
      });
      
      ws.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async sendWebSocketMessage(ws: WebSocket, message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (ws.readyState !== ws.OPEN) {
        reject(new Error("WebSocket not open"));
        return;
      }
      
      ws.send(JSON.stringify(message), (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async queryVoiceCall(callId: string): Promise<VoiceCall | undefined> {
    return await storage.getVoiceCall(callId);
  }

  async queryVoiceTurns(callId: string): Promise<VoiceTurn[]> {
    return await storage.getVoiceTurnsByCall(callId);
  }

  async queryJob(jobId: string): Promise<Job | undefined> {
    return await storage.getJob(jobId);
  }

  async queryJobRuns(jobId: string): Promise<JobRun[]> {
    return await storage.getJobRuns(jobId);
  }

  async querySourcesForCall(callId: string): Promise<Source[]> {
    const sourceRows = await db.select().from(sources)
      .where(and(
        eq(sources.type, "voice_call"),
        eq(sources.externalId, callId)
      ));
    
    return sourceRows;
  }

  async querySourceVersions(sourceId: string): Promise<SourceVersion[]> {
    return await storage.getSourceVersions(sourceId);
  }

  async queryChunksForSourceVersion(sourceVersionId: string): Promise<Chunk[]> {
    const allChunks = await db.select().from(chunks)
      .where(eq(chunks.sourceVersionId, sourceVersionId));
    return allChunks;
  }

  async queryTrace(traceId: string): Promise<Trace | undefined> {
    return await storage.getTrace(traceId);
  }

  async cleanup(): Promise<void> {
    // Clean up test data
    if (this.testCallIds.length > 0) {
      for (const callId of this.testCallIds) {
        try {
          await db.delete(voiceTurns).where(eq(voiceTurns.callId, callId));
          await db.delete(voiceCalls).where(eq(voiceCalls.id, callId));
        } catch (e) {
          // Ignore errors
        }
      }
    }
    
    if (this.testSourceIds.length > 0) {
      for (const sourceId of this.testSourceIds) {
        try {
          await db.delete(chunks).where(eq(chunks.sourceId, sourceId));
          await db.delete(sourceVersions).where(eq(sourceVersions.sourceId, sourceId));
          await db.delete(sources).where(eq(sources.id, sourceId));
        } catch (e) {
          // Ignore errors
        }
      }
    }
    
    if (this.testUserId) {
      try {
        // Clean up user's data
        await db.delete(voiceCalls).where(eq(voiceCalls.userId, this.testUserId));
        await db.delete(chunks).where(eq(chunks.userId, this.testUserId));
        await db.delete(sources).where(eq(sources.userId, this.testUserId));
        // Note: Don't delete user as it might be reused
      } catch (e) {
        // Ignore errors
      }
    }
  }

  trackCallId(callId: string): void {
    this.testCallIds.push(callId);
  }

  async processJobDirectly(jobId: string): Promise<void> {
    // Ensure handlers are registered
    await import("../server/lib/jobs/handlers/index");
    
    const job = await storage.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    
    // Use job runner to process the job
    const { startJobRunner, stopJobRunner } = await import("../server/lib/jobs/runner");
    const runner = startJobRunner();
    
    try {
      // Wait for job to be processed (with timeout)
      const startTime = Date.now();
      const timeout = 30000;
      
      while (Date.now() - startTime < timeout) {
        const updatedJob = await storage.getJob(job.id);
        if (updatedJob?.status === "completed") {
          return;
        }
        if (updatedJob?.status === "failed" || updatedJob?.status === "dead_letter") {
          const runs = await storage.getJobRuns(job.id);
          const lastRun = runs[runs.length - 1];
          throw new Error(`Job failed: ${lastRun?.error || "Unknown error"}`);
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      throw new Error(`Timeout waiting for job ${jobId} to complete`);
    } finally {
      stopJobRunner();
    }
  }

  async createTestPolicy(yamlText: string, isActive: boolean = true): Promise<string> {
    const policy = await storage.createPolicy({
      name: `test-policy-${Date.now()}`,
      yamlText,
      isActive,
    });
    return policy.id;
  }
}

export const helpers = new TestHelpers();

