
const Database = require('better-sqlite3');
const db = new Database('proof/db.sqlite');

const rows = db.prepare("PRAGMA table_info(audit_events)").all();
console.log("Audit Events Schema:");
console.table(rows);

const rows2 = db.prepare("PRAGMA table_info(approvals)").all();
console.log("Approvals Schema:");
console.table(rows2);
