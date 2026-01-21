import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const dialect = (process.env.DATABASE_DIALECT as "postgresql" | "sqlite") || "postgresql";

export default defineConfig({
  out: dialect === "sqlite" ? "./migrations_sqlite" : "./migrations",
  schema: "./shared/schema.ts",
  dialect: dialect,
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
