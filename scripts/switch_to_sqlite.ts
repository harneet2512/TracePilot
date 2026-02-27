
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "../shared/schema.ts");
const backupPath = path.join(__dirname, "../shared/schema.pg.ts"); // The Source of Truth for Postgres

// 1. Backup if not exists
if (!fs.existsSync(backupPath)) {
    console.log("Backing up shared/schema.ts to shared/schema.pg.ts");
    fs.copyFileSync(schemaPath, backupPath);
}

// 2. Read from Backup (Postgres source)
const content = fs.readFileSync(backupPath, "utf-8");

let newContent = content;

// ... Transformations ...

// Replace Imports
newContent = newContent.replace(
    /import { pgTable,.*} from "drizzle-orm\/pg-core";/,
    `import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto"; 
// Shims
const pgTable = sqliteTable;
const varchar = (name: string, opts?: any) => text(name);
const jsonb = (name: string) => text(name, { mode: "json" });
const boolean = (name: string) => integer(name, { mode: "boolean" });
const timestamp = (name: string) => integer(name, { mode: "timestamp" });`
);

// defaultNow()
newContent = newContent.replaceAll(".defaultNow()", ".$defaultFn(() => new Date())");

// gen_random_uuid()
newContent = newContent.replace(/\.default\(sql`gen_random_uuid\(\)`\)/g, `.$defaultFn(() => randomUUID())`);

// Array types matching: text("...").array()
newContent = newContent.replace(/text\("([^"]+)"\)\.array\(\)/g, `text("$1", { mode: "json" })`);
newContent = newContent.replace(/varchar\("([^"]+)"(?:, \{[^}]*\})?\)\.array\(\)/g, `text("$1", { mode: "json" })`);

// Remove original crypto import if present
newContent = newContent.replace('import { randomUUID } from "crypto";', '// import { randomUUID } from "crypto"; // Moved up');

// Write to schema.ts (Overwriting it with SQLite version)
fs.writeFileSync(schemaPath, newContent);
console.log("Switched shared/schema.ts to SQLite version.");
