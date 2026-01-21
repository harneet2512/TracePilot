/**
 * Manual Job Insertion Test - Isolates JobRunner from Enqueue Layer
 * 
 * This script:
 * 1. Inserts a job DIRECTLY into the jobs table (bypasses routes)
 * 2. Polls for a job_run to appear (tests JobRunner)
 * 3. Reports success/failure with clear diagnostics
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc } from "drizzle-orm";
import { jobs, jobRuns } from "../shared/schema";
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/fieldcopilot_test";

async function main() {
    console.log("[ManualJobTest] Connecting to:", DATABASE_URL.split("@")[1] || DATABASE_URL);

    const pool = new Pool({ connectionString: DATABASE_URL });
    const db = drizzle(pool);

    // Step 1: Create a test job directly
    const testJobId = randomUUID();
    const testJob = {
        id: testJobId,
        workspaceId: "default-workspace",
        userId: "admin-user-id",
        type: "sync" as const,
        connectorType: "google" as const,
        scopeId: "test-scope-" + Date.now(),
        status: "pending" as const,
        priority: 0,
        idempotencyKey: "manual-test:" + Date.now(),
        inputJson: { test: true, scopeId: "test", connectorType: "google" },
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    console.log("[ManualJobTest] Inserting test job with id:", testJobId);
    console.log("[ManualJobTest] Job details:", JSON.stringify({ type: testJob.type, connectorType: testJob.connectorType, status: testJob.status }));

    try {
        await (db as any).insert(jobs).values(testJob);
        console.log("[ManualJobTest] ✅ Job inserted successfully!");
    } catch (err: any) {
        console.error("[ManualJobTest] ❌ FAILED to insert job:", err.message);
        await pool.end();
        process.exit(1);
    }

    // Step 2: Verify job exists
    const [insertedJob] = await (db as any).select().from(jobs).where(eq(jobs.id, testJobId));
    if (!insertedJob) {
        console.error("[ManualJobTest] ❌ Job not found after insert! Database write issue.");
        await pool.end();
        process.exit(1);
    }
    console.log("[ManualJobTest] ✅ Job confirmed in DB with status:", insertedJob.status);

    // Step 3: Count total jobs
    const allJobs = await (db as any).select().from(jobs).orderBy(desc(jobs.createdAt)).limit(5);
    console.log("[ManualJobTest] Total recent jobs in DB:", allJobs.length);
    for (const j of allJobs) {
        console.log(`  - ${j.id} | type=${j.type} | connector=${j.connectorType} | status=${j.status}`);
    }

    // Step 4: Wait for job_run to appear (max 30 seconds)
    console.log("\n[ManualJobTest] Waiting for JobRunner to process (polling for job_run)...");
    console.log("[ManualJobTest] If JobRunner is working, it should claim this job within 5-10 seconds.");

    let found = false;
    for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 2500));

        // Check job status change
        const [currentJob] = await (db as any).select().from(jobs).where(eq(jobs.id, testJobId));
        console.log(`[ManualJobTest] Poll ${i + 1}/12: job.status=${currentJob?.status}, lockedBy=${currentJob?.lockedBy || 'none'}`);

        // Check for job_run
        const runs = await (db as any).select().from(jobRuns).where(eq(jobRuns.jobId, testJobId));
        if (runs.length > 0) {
            console.log("[ManualJobTest] ✅ job_run FOUND! JobRunner is working.");
            console.log("[ManualJobTest] Run details:", JSON.stringify(runs[0], null, 2));
            found = true;
            break;
        }

        // If job completed/failed, that's also success
        if (currentJob?.status === "completed" || currentJob?.status === "failed" || currentJob?.status === "dead_letter") {
            console.log(`[ManualJobTest] ✅ Job reached terminal status: ${currentJob.status}`);
            found = true;
            break;
        }
    }

    if (!found) {
        console.error("\n[ManualJobTest] ❌ TIMEOUT: No job_run appeared after 30 seconds.");
        console.error("[ManualJobTest] DIAGNOSIS: JobRunner is NOT processing jobs.");
        console.error("[ManualJobTest] Possible causes:");
        console.error("  1. JobRunner not started (check if 'npm run dev' shows [JobRunner] logs)");
        console.error("  2. JobRunner query filters don't match job.type='sync'");
        console.error("  3. Database connection mismatch between server and this script");

        // Cleanup
        await (db as any).delete(jobs).where(eq(jobs.id, testJobId));
        console.log("[ManualJobTest] Cleaned up test job.");
    } else {
        console.log("\n[ManualJobTest] ===== SUCCESS =====");
        console.log("[ManualJobTest] JobRunner layer is WORKING.");
        console.log("[ManualJobTest] If real jobs aren't processing, the issue is in the ENQUEUE layer (routes not inserting).");
    }

    await pool.end();
    process.exit(found ? 0 : 1);
}

main().catch(console.error);
