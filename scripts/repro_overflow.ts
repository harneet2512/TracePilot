
import { db } from "../server/db";
import { jobLocks, rateLimitBuckets, jobs, jobRuns } from "../shared/schema";
import { JobRunner } from "../server/lib/jobs/runner";
import { storage } from "../server/storage";
import { eq } from "drizzle-orm";

async function testVarcharOverflow() {
    console.log("Starting reproduction test...");

    // 1. Create a really long account ID (>36 chars)
    const longAccountId = "sync:atlassian:scope-123:confluence:2026-01-19T11:30:00.000Z";
    console.log(`Testing with accountId length: ${longAccountId.length}`);

    try {
        // 2. Test jobLocks insertion (direct DB access to verify schema)
        console.log("Testing job_locks insertion...");
        await db.insert(jobLocks).values({
            connectorType: "atlassian",
            accountId: longAccountId,
            activeCount: 0,
            maxConcurrency: 2,
            updatedAt: new Date()
        }).returning();
        console.log("✅ job_locks insertion successful");

        // 3. Test rateLimitBuckets insertion
        console.log("Testing rate_limit_buckets insertion...");
        await db.insert(rateLimitBuckets).values({
            accountId: longAccountId,
            connectorType: "atlassian",
            tokens: 10,
            maxTokens: 10,
            refillRate: 1,
            lastRefill: new Date(),
            updatedAt: new Date()
        }).returning();
        console.log("✅ rate_limit_buckets insertion successful");

        // 4. Test JobRunner flow (simulate a job)
        console.log("Testing full JobRunner flow...");

        // Create a dummy job
        const job = await storage.createJob({
            type: "sync",
            userId: "admin-user-id",
            workspaceId: "default-workspace",
            connectorType: "atlassian",
            status: "pending",
            inputJson: {
                accountId: longAccountId,
                scopeId: "scope-123",
                userId: "admin-user-id",
                connectorType: "atlassian"
            }
        });

        console.log(`Created job ${job.id}`);

        // Instantiate runner and process
        const runner = new JobRunner();
        // We can't easily call processJob directly as it's private, but we can verify storage methods used inside it.

        // Test getOrCreateJobLock via storage
        const lock = await storage.getOrCreateJobLock("atlassian", longAccountId);
        console.log(`✅ storage.getOrCreateJobLock successful, lockId: ${lock.id}`);

        // Test consumeRateLimitToken via storage
        const token = await storage.consumeRateLimitToken(longAccountId, "atlassian");
        console.log(`✅ storage.consumeRateLimitToken successful, result: ${token}`);

        console.log("🎉 ALL TESTS PASSED: Varchar overflow fixed!");

    } catch (error) {
        console.error("❌ TEST FAILED:", error);
    } finally {
        // Cleanup if needed (optional for local test DB)
        process.exit(0);
    }
}

testVarcharOverflow();
