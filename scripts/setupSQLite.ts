// SQLite database setup script for local development
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as schema from "../shared/schema";

async function setupSQLite() {
    console.log("Setting up SQLite database for local development...\n");

    // Create .data directory if it doesn't exist
    if (!existsSync(".data")) {
        await mkdir(".data", { recursive: true });
        console.log("✓ Created .data directory");
    }

    // Create SQLite database
    const sqlite = new Database(".data/dev.db");
    const db = drizzle(sqlite, { schema });

    console.log("✓ SQLite database created at .data/dev.db");
    console.log("\nTo use this database, set:");
    console.log('  DATABASE_URL="file:./.data/dev.db"');
    console.log('  DATABASE_DIALECT="sqlite"\n');

    // Test connection
    const result = sqlite.prepare("SELECT 1 as test").get();
    console.log("✓ Database connection successful");

    sqlite.close();

    return {
        success: true,
        path: ".data/dev.db",
        url: "file:./.data/dev.db"
    };
}

setupSQLite()
    .then((result) => {
        console.log("\n✅ SQLite setup complete");
        console.log(`Database path: ${result.path}`);
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ SQLite setup failed:", error);
        process.exit(1);
    });
