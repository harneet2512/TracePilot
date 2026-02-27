import "dotenv/config";

console.log("=== TracePilot Environment Targets ===");

const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  try {
    const u = new URL(dbUrl);
    console.log(`DATABASE_URL: host=${u.hostname} port=${u.port || 5432} db=${u.pathname.slice(1)} user=${u.username}`);
  } catch {
    console.log("DATABASE_URL: <set but unparseable>");
  }
} else {
  console.log("DATABASE_URL: <NOT SET>");
}

console.log(`DEV_CONNECTOR_FIXTURES: ${process.env.DEV_CONNECTOR_FIXTURES || "0"}`);
console.log(`PROOF_MODE: ${process.env.PROOF_MODE || "0"}`);
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "<set>" : "<NOT SET>"}`);
console.log(`OPENAI_API_KEY_NEW: ${process.env.OPENAI_API_KEY_NEW ? "<set>" : "<NOT SET>"}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);

if (!dbUrl) {
  console.error("\nERROR: DATABASE_URL is required.");
  process.exit(1);
}
console.log("\nAll required env vars present.");
process.exit(0);
