import { storage } from "../../storage";
import type { Job, InsertJobRun } from "@shared/schema";
import { randomUUID } from "crypto";

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 3;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

type JobType = "sync" | "ingest" | "eval" | "playbook";
type JobHandler = (job: Job) => Promise<{ success: boolean; output?: unknown; error?: string }>;

const handlers: Map<string, JobHandler> = new Map();

export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
}

function calculateBackoff(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30 * 60 * 1000);
}

export class JobRunner {
  private workerId: string;
  private isRunning = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

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
    console.log(`[JobRunner] Stopped worker ${this.workerId}`);
  }

  private async poll() {
    if (!this.isRunning) return;

    try {
      await this.cleanupStaleJobs();
      const jobs = await storage.getPendingJobs(5);
      
      for (const job of jobs) {
        if (!this.isRunning) break;
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
    const locked = await storage.lockJob(job.id, this.workerId);
    if (!locked) return;

    const startTime = Date.now();
    const attemptNumber = (job.attempts || 0) + 1;

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
        await this.handleSuccess(job, createdRun.id, startTime, result.output);
      } else {
        await this.handleFailure(job, createdRun.id, startTime, result.error || "Job failed without error message");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.handleFailure(job, createdRun.id, startTime, errorMessage);
    }
  }

  private async handleSuccess(job: Job, runId: string, startTime: number, output?: unknown) {
    const duration = Date.now() - startTime;
    
    await storage.updateJobRun(runId, {
      status: "completed",
      finishedAt: new Date(),
      statsJson: { durationMs: duration, output },
    });

    await storage.updateJob(job.id, {
      status: "completed",
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    });

    console.log(`[JobRunner] Job ${job.id} completed successfully in ${duration}ms`);
  }

  private async handleFailure(job: Job, runId: string, startTime: number, error: string) {
    const duration = Date.now() - startTime;
    const attempts = (job.attempts || 0) + 1;
    const maxAttempts = job.maxAttempts ?? MAX_ATTEMPTS;

    await storage.updateJobRun(runId, {
      status: "failed",
      finishedAt: new Date(),
      error,
      statsJson: { durationMs: duration },
    });

    if (attempts >= maxAttempts) {
      await storage.updateJob(job.id, {
        status: "dead_letter",
        attempts,
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      });
      console.log(`[JobRunner] Job ${job.id} moved to dead letter queue after ${attempts} attempts`);
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
