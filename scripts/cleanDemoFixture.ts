/**
 * Clean Demo Fixture Script
 * Removes demo fixtures without affecting golden/prod data
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function main() {
  console.log("=== Cleaning Demo Fixtures ===\n");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("Removing demo data...");

    const chunkResult = await pool.query(`DELETE FROM chunks WHERE id LIKE 'demo-%'`);
    console.log(`  Chunks deleted: ${chunkResult.rowCount || 0}`);

    const versionResult = await pool.query(`DELETE FROM source_versions WHERE id LIKE 'demo-%'`);
    console.log(`  Source versions deleted: ${versionResult.rowCount || 0}`);

    const sourceResult = await pool.query(`DELETE FROM sources WHERE id LIKE 'demo-%'`);
    console.log(`  Sources deleted: ${sourceResult.rowCount || 0}`);

    const scopeResult = await pool.query(`DELETE FROM user_connector_scopes WHERE id LIKE 'demo-%'`);
    console.log(`  Scopes deleted: ${scopeResult.rowCount || 0}`);

    // Verify cleanup
    const verifyChunks = await pool.query(`SELECT COUNT(*) FROM chunks WHERE id LIKE 'demo-%'`);
    const verifySources = await pool.query(`SELECT COUNT(*) FROM sources WHERE id LIKE 'demo-%'`);

    console.log("\n=== Cleanup Verification ===");
    console.log(`Remaining demo chunks: ${verifyChunks.rows[0].count}`);
    console.log(`Remaining demo sources: ${verifySources.rows[0].count}`);

    const remaining = parseInt(verifyChunks.rows[0].count) + parseInt(verifySources.rows[0].count);

    if (remaining === 0) {
      console.log("\n✅ Cleanup successful!");
      process.exit(0);
    } else {
      console.log("\n⚠️  Warning: Some demo data remains");
      process.exit(1);
    }
  } catch (error: any) {
    console.error("Cleanup error:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
