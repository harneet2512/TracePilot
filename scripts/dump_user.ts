
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import "dotenv/config"; // Ensure env is loaded

async function dumpUser() {
    try {
        const email = "demo-eval@example.com";
        console.log(`Searching for user: ${email} with FRESH connection`);

        if (!process.env.DATABASE_URL) {
            throw new Error("DATABASE_URL not set");
        }

        // Create a fresh pool to avoid shared state issues
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        const db = drizzle(pool, { schema });

        // Test connection first
        await pool.query('SELECT 1');
        console.log("DB Connection OK");

        const userPromise = db.select().from(users).where(eq(users.email, email));
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 5000));

        const [user] = await Promise.race([userPromise, timeoutPromise]) as any;

        if (!user) {
            console.log("User NOT FOUND");
        } else {
            console.log("User Found:");
            console.log("ID:", user.id);
            console.log("Email:", user.email);
            console.log("Role:", user.role);
            console.log("Password Hash:", user.passwordHash ? user.passwordHash.substring(0, 10) + "..." : "NULL");
        }

        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error("Error dumping user:", err);
        process.exit(1);
    }
}

dumpUser();
