import { storage } from "../../storage";
import type { Job, InsertJobRun } from "@shared/schema";
import { randomUUID } from "crypto";

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 3;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

type JobType = "sync" | "ingest" | "eval" | "playbook";
type JobHandler = (job: Job) => Promise<{ 
  success: boolean; 
  output?: unknown; 
  error?: string;
  errorCode?: string;
  stats?: JobStats;
}>;

export interface JobStats {
  discovered?: number;
  processed?: number;
  skipped?: number;
  failed?: number;
  durationMs?: number;
}

const handlers: Map<string, JobHandler> = new Map();

export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

function calculateBackoff(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30 * 60 * 1000);
}

function shouldRetry(errorCode?: string, errorMessage?: string): boolean {
  if (!errorCode && !errorMessage) return true;
  
  if (errorCode === "429" || errorMessage?.includes("rate limit") || errorMessage?.includes("429")) {
    return true;
  }
  if (errorCode?.startsWith("5") || errorMessage?.includes("500") || errorMessage?.includes("503")) {
    return true;
  }
  if (errorMessage?.includes("timeout") || errorMessage?.includes("ETIMEDOUT")) {
    return true;
  }
  if (errorCode?.startsWith("4") && errorCode !== "401" && errorCode !== "403") {
    return false;
  }
  
  return true;
}

export class JobRunner {
  private workerId: string;
  private isRunning = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private activeLocks: Map<string, string> = new Map();

  constructor() {
    this.workerId = `worker-${randomUUID().slice(0, 8)}`;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[JobRunner] Starting worker ${this.workerId}`);
    this.poll();
  }

  async stop() {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    
    const entries = Array.from(this.activeLocks.entries());
    for (let i = 0; i < entries.length; i++) {
      const [jobId, lockId] = entries[i];
      try {
        await storage.decrementJobLockCount(lockId);
      } catch (e) {
        console.error(`[JobRunner] Failed to release lock for job ${jobId}:`, e);
      }
    }
    this.activeLocks.clear();
    
    console.log(`[JobRunner] Stopped worker ${this.workerId}`);
  }

  private async poll() {
    if (!this.isRunning) return;

    try {
      await this.cleanupStaleJobs();
      
      const job = await storage.claimJobWithLock(this.workerId, 1);
      
      if (job) {
        await this.processJob(job);
      }
    } catch (error) {
      console.error("[JobRunner] Poll error:", error);
    }

    if (this.isRunning) {
      this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL_MS);
    }
  }

  private async cleanupStaleJobs() {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    
    const staleJobs = await storage.getStaleRunningJobs(staleThreshold);
    for (const job of staleJobs) {
      if (job.lockedBy) {
        await storage.unlockStaleJob(job.id, job.lockedBy);
        console.log(`[JobRunner] Unlocked stale job ${job.id} (was locked by ${job.lockedBy})`);
      }
    }
  }

  private async processJob(job: Job) {
    const startTime = Date.now();
    const attemptNumber = (job.attempts || 0) + 1;

    const connectorType = job.connectorType || "upload";
    const accountId = (job.inputJson as { accountId?: string })?.accountId;
    
    const canAcquire = await storage.canAcquireConcurrencySlot(connectorType, accountId);
    if (!canAcquire) {
      console.log(`[JobRunner] Concurrency limit reached for ${connectorType}/${accountId}, requeueing job ${job.id}`);
      await storage.updateJob(job.id, {
        status: "pending",
        lockedAt: null,
        lockedBy: null,
        nextRunAt: new Date(Date.now() + 5000),
      });
      return;
    }

    if (accountId) {
      const hasToken = await storage.consumeRateLimitToken(accountId, connectorType);
      if (!hasToken) {
        console.log(`[JobRunner] Rate limit exceeded for ${connectorType}/${accountId}, requeueing job ${job.id}`);
        await storage.updateJob(job.id, {
          status: "pending",
          lockedAt: null,
          lockedBy: null,
          nextRunAt: new Date(Date.now() + 10000),
        });
        return;
      }
    }

    const lock = await storage.getOrCreateJobLock(connectorType, accountId);
    const acquired = await storage.incrementJobLockCount(lock.id);
    
    if (!acquired) {
      console.log(`[JobRunner] Failed to acquire concurrency slot for job ${job.id}`);
      await storage.updateJob(job.id, {
        status: "pending",
        lockedAt: null,
        lockedBy: null,
        nextRunAt: new Date(Date.now() + 5000),
      });
      return;
    }
    
    this.activeLocks.set(job.id, lock.id);

    const run: InsertJobRun = {
      jobId: job.id,
      attemptNumber,
      status: "running",
      startedAt: new Date(),
    };
    
    const createdRun = await storage.createJobRun(run);
    console.log(`[JobRunner] Processing job ${job.id} (${job.type}), attempt ${attemptNumber}`);

    const handler = handlers.get(job.type);
    if (!handler) {
      await this.handleFailure(job, createdRun.id, startTime, `No handler registered for job type: ${job.type}`);
      return;
    }

    try {
      const result = await handler(job);
      
      if (result.success) {
        await this.handleSuccess(job, createdRun.id, startTime, result.output, result.stats);
      } else {
        const canRetry = shouldRetry(result.errorCode, result.error);
        await this.handleFailure(
          job, 
          createdRun.id, 
          startTime, 
          result.error || "Job failed without error message",
          result.errorCode,
          result.stats,
          canRetry
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.handleFailure(job, createdRun.id, startTime, errorMessage);
    } finally {
      await storage.decrementJobLockCount(lock.id);
      this.activeLocks.delete(job.id);
    }
  }

  private async handleSuccess(job: Job, runId: string, startTime: number, output?: unknown, stats?: JobStats) {
    const duration = Date.now() - startTime;
    
    await storage.updateJobRun(runId, {
      status: "completed",
      finishedAt: new Date(),
      statsJson: { 
        durationMs: duration, 
        output,
        ...stats
      },
    });

    await storage.updateJob(job.id, {
      status: "completed",
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    });

    console.log(`[JobRunner] Job ${job.id} completed successfully in ${duration}ms`);
  }

  private async handleFailure(
    job: Job, 
    runId: string, 
    startTime: number, 
    error: string,
    errorCode?: string,
    stats?: JobStats,
    canRetry = true
  ) {
    const duration = Date.now() - startTime;
    const attempts = (job.attempts || 0) + 1;
    const maxAttempts = job.maxAttempts ?? MAX_ATTEMPTS;

    await storage.updateJobRun(runId, {
      status: "failed",
      finishedAt: new Date(),
      error,
      errorCode: errorCode || null,
      statsJson: { durationMs: duration, ...stats },
    });

    if (!canRetry || attempts >= maxAttempts) {
      await storage.updateJob(job.id, {
        status: "dead_letter",
        attempts,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      });
      console.log(`[JobRunner] Job ${job.id} moved to dead letter queue after ${attempts} attempts (canRetry: ${canRetry})`);
    } else {
      const backoff = calculateBackoff(attempts);
      const nextRunAt = new Date(Date.now() + backoff);
      
      await storage.updateJob(job.id, {
        status: "pending",
        attempts,
        nextRunAt,
        lockedAt: null,
        lockedBy: null,
      });
      console.log(`[JobRunner] Job ${job.id} scheduled for retry at ${nextRunAt.toISOString()} (attempt ${attempts})`);
    }
  }
}

export async function enqueueJob(options: {
  type: JobType;
  userId: string;
  payload: unknown;
  connectorType?: "google" | "atlassian" | "slack" | "upload";
  scopeId?: string;
  idempotencyKey?: string;
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
}): Promise<Job> {
  if (options.idempotencyKey) {
    const existing = await storage.getJobByIdempotencyKey(options.idempotencyKey);
    if (existing) {
      console.log(`[JobRunner] Returning existing job for idempotency key: ${options.idempotencyKey}`);
      return existing;
    }
  }

  const job = await storage.createJob({
    type: options.type,
    userId: options.userId,
    inputJson: options.payload as Record<string, unknown>,
    connectorType: options.connectorType || null,
    scopeId: options.scopeId || null,
    idempotencyKey: options.idempotencyKey || null,
    priority: options.priority ?? 0,
    maxAttempts: options.maxAttempts ?? MAX_ATTEMPTS,
    status: "pending",
    nextRunAt: options.runAt || new Date(),
  });

  console.log(`[JobRunner] Enqueued job ${job.id} (${job.type})`);
  return job;
}

let runner: JobRunner | null = null;

export function startJobRunner() {
  if (!runner) {
    runner = new JobRunner();
    runner.start();
  }
  return runner;
}

export function stopJobRunner() {
  if (runner) {
    runner.stop();
    runner = null;
  }
}
