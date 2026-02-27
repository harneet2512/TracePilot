/**
 * Proof: Verify GET /api/jobs/scope/:scopeId/latest returns correct JSON shape.
 *
 * Usage: npx tsx scripts/proof_latest_job_endpoint.ts
 * Requires: DATABASE_URL env var, server running on port 3000 (or PORT)
 */
import "dotenv/config";
import pg from "pg";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL not set");
    process.exit(1);
  }

  const port = process.env.PORT || 3000;
  const pool = new pg.Pool({ connectionString: dbUrl });

  try {
    // 1) Read latest scope from DB
    const scopeRes = await pool.query(
      `SELECT id FROM user_connector_scopes ORDER BY created_at DESC LIMIT 1`
    );

    if (scopeRes.rows.length === 0) {
      console.log("No scopes found in DB. Cannot test endpoint.");
      process.exit(1);
    }

    const scopeId = scopeRes.rows[0].id;
    console.log(`Testing with scopeId: ${scopeId}`);

    // 2) Hit endpoint with skip_auth
    const url = `http://localhost:${port}/api/jobs/scope/${scopeId}/latest?skip_auth=1`;
    console.log(`GET ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`FAIL: HTTP ${response.status} ${response.statusText}`);
      const body = await response.text();
      console.error(`Body: ${body}`);
      process.exit(1);
    }

    const data = await response.json() as any;
    console.log(`Response: ${JSON.stringify(data, null, 2).slice(0, 500)}`);

    // 3) Validate shape
    const requiredKeys = ["job", "latestRun", "progress", "counts"];
    const missingKeys = requiredKeys.filter(k => !(k in data));

    if (missingKeys.length > 0) {
      console.error(`FAIL: Missing keys in response: ${missingKeys.join(", ")}`);
      process.exit(1);
    }

    // Validate counts shape
    if (data.counts && typeof data.counts === "object") {
      console.log(`Counts: sources=${data.counts.sources}, chunks=${data.counts.chunks}`);
    }

    // Validate progress shape (if job exists)
    if (data.job && data.progress) {
      console.log(`Progress: phase=${data.progress.phase}, processedSources=${data.progress.processedSources}, processedChunks=${data.progress.processedChunks}`);
    }

    console.log("\nPASS: Endpoint returns correct JSON shape with job, latestRun, progress, counts");
    process.exit(0);
  } catch (err: any) {
    if (err.cause?.code === "ECONNREFUSED") {
      console.error("FAIL: Server not running. Start the server first.");
    } else {
      console.error("Error:", err);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
