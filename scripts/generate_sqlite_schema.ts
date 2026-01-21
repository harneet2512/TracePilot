
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "../shared/schema.ts");
const outPath = path.join(__dirname, "../shared/schema.sqlite.ts");

const content = fs.readFileSync(schemaPath, "utf-8");

let newContent = content;

// 1. Imports
newContent = newContent.replace(
    /import { pgTable,.*} from "drizzle-orm\/pg-core";/,
    `import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto"; 
// Shims
const pgTable = sqliteTable;
const varchar = (name: string, opts?: any) => text(name);
const jsonb = (name: string) => text(name, { mode: "json" });
const boolean = (name: string) => integer(name, { mode: "boolean" });
// Timestamp shim handles the builder creation, but .defaultNow() replacement happens in text
const timestamp = (name: string) => integer(name, { mode: "timestamp" });`
);

// 2. defaultNow() -> $defaultFn(() => new Date())
// Handle both .defaultNow().notNull() and .notNull().defaultNow() patterns
newContent = newContent.replaceAll(".defaultNow()", ".$defaultFn(() => new Date())");

// 3. gen_random_uuid() -> randomUUID()
// Pattern: .default(sql`gen_random_uuid()`)
// We use a regex to catch all occurrences robustly
newContent = newContent.replace(/\.default\(sql`gen_random_uuid\(\)`\)/g, `.$defaultFn(() => randomUUID())`);


// 4. Handle .array() calls (Postgres arrays -> SQLite JSON)
// Pattern: text("name").array() -> text("name", { mode: "json" })
// We need to capture the name from the text/varchar call preceding .array()
// This is hard with simple regex if arguments vary.
// Assume pattern: text("...") or varchar("...") followed immediately by .array()
// We can just remove .array() if we change the column definition to have { mode: "json" }
// BUT text("...") might not have the options obj initially.
// Easiest hack: Replace `.array()` with nothing, BUT ensure the column is treated as JSON?
// No, Zod schema needs to know it's an array. Drizzle needs to know to parse it.
// text("...", { mode: "json" }) gives us T[] type in TS inference usually? Yes.

// Let's rely on text replacement for specific known array columns if few?
// Or generic regex: matches `text\("([^"]+)"\)\.array\(\)`
newContent = newContent.replace(/text\("([^"]+)"\)\.array\(\)/g, `text("$1", { mode: "json" })`);
newContent = newContent.replace(/varchar\("([^"]+)"(?:, \{[^}]*\})?\)\.array\(\)/g, `text("$1", { mode: "json" })`);

// 5. Remove original crypto import if present
newContent = newContent.replace('import { randomUUID } from "crypto";', '// import { randomUUID } from "crypto"; // Moved up');


fs.writeFileSync(outPath, newContent);
console.log("Generated shared/schema.sqlite.ts");
