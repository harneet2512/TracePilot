import Database from "better-sqlite3";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

const dbPath = "proof/db.sqlite";
const db = new Database(dbPath);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

function ensureCoreSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Chat',
      summary TEXT,
      environment TEXT,
      model TEXT,
      model_config_json TEXT,
      retrieval_config_json TEXT,
      entrypoint TEXT,
      app_version TEXT,
      git_sha TEXT,
      final_outcome TEXT,
      error_class TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  ensureColumn("conversations", "summary", "TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_call_id TEXT,
      citations_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_replies (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      latency_ms INTEGER,
      ttft_ms INTEGER,
      tokens_in INTEGER,
      tokens_out INTEGER,
      cost_usd REAL,
      status TEXT NOT NULL DEFAULT 'ok',
      error_type TEXT,
      trace_id TEXT,
      streamed INTEGER NOT NULL DEFAULT 1,
      scored INTEGER NOT NULL DEFAULT 0,
      scored_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reply_retrieval_artifacts (
      id TEXT PRIMARY KEY,
      reply_id TEXT NOT NULL,
      retrieval_mode TEXT,
      top_k INTEGER,
      chunks_returned_count INTEGER,
      sources_returned_count INTEGER,
      top_similarity REAL,
      retrieval_latency_ms INTEGER,
      retrieved_chunks_json TEXT,
      dedup_stats_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reply_citation_artifacts (
      id TEXT PRIMARY KEY,
      reply_id TEXT NOT NULL,
      citations_json TEXT,
      citation_coverage_rate REAL,
      citation_integrity_rate REAL,
      citation_misattribution_rate REAL,
      repair_applied INTEGER NOT NULL DEFAULT 0,
      repair_notes_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reply_llm_eval_artifacts (
      id TEXT PRIMARY KEY,
      reply_id TEXT NOT NULL,
      claims_json TEXT,
      claim_labels_json TEXT,
      grounded_claim_rate REAL,
      unsupported_claim_rate REAL,
      contradiction_rate REAL,
      completeness_score REAL,
      missing_points_json TEXT,
      answer_relevance_score REAL,
      context_relevance_score REAL,
      context_recall_score REAL,
      low_evidence_calibration_json TEXT,
      format_valid_rate REAL,
      judge_model TEXT,
      judge_version TEXT,
      judge_rationales_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS reply_tool_artifacts (
      id TEXT PRIMARY KEY,
      reply_id TEXT NOT NULL,
      tool_calls_json TEXT,
      tool_selection_accuracy REAL,
      parameter_correctness REAL,
      idempotency_key TEXT,
      duplicate_action_detected INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS enterprise_eval_artifacts (
      id TEXT PRIMARY KEY,
      reply_id TEXT,
      run_id TEXT,
      eval_pack_version TEXT DEFAULT 'v1',
      evidence_coverage_score REAL,
      evidence_coverage_pass INTEGER,
      evidence_coverage_rationale TEXT,
      evidence_coverage_map_json TEXT,
      evidence_sufficiency_score REAL,
      evidence_sufficiency_pass INTEGER,
      evidence_sufficiency_rationale TEXT,
      evidence_sufficiency_details_json TEXT,
      multihop_trace_score REAL,
      multihop_trace_pass INTEGER,
      multihop_trace_rationale TEXT,
      multihop_trace_json TEXT,
      directness_score REAL,
      directness_pass INTEGER,
      directness_rationale TEXT,
      actionability_score REAL,
      actionability_pass INTEGER,
      actionability_rationale TEXT,
      clarity_score REAL,
      clarity_pass INTEGER,
      clarity_rationale TEXT,
      clarity_details_json TEXT,
      followup_quality_score REAL,
      followup_quality_pass INTEGER,
      followup_quality_rationale TEXT,
      source_scope_pass INTEGER,
      source_scope_score REAL,
      source_scope_rationale TEXT,
      source_scope_violations_json TEXT,
      missing_data_hallucination_pass INTEGER,
      missing_data_hallucination_score REAL,
      missing_data_hallucination_rationale TEXT,
      pii_leak_pass INTEGER,
      pii_leak_score REAL,
      pii_leak_rationale TEXT,
      pii_leak_findings_json TEXT,
      stability_variance REAL,
      stability_pass INTEGER,
      stability_rationale TEXT,
      stability_details_json TEXT,
      retrieval_drift_score REAL,
      retrieval_drift_pass INTEGER,
      retrieval_drift_rationale TEXT,
      retrieval_drift_json TEXT,
      citation_ui_readiness_score REAL,
      citation_ui_readiness_pass INTEGER,
      citation_ui_readiness_rationale TEXT,
      citation_ui_details_json TEXT,
      debug_panel_completeness_score REAL,
      debug_panel_completeness_pass INTEGER,
      debug_panel_completeness_rationale TEXT,
      debug_panel_missing_json TEXT,
      overall_score REAL,
      overall_pass INTEGER,
      summary_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function ensureWorkspace() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(`
    INSERT OR IGNORE INTO workspaces (id, name, created_at)
    VALUES (?, ?, datetime('now'));
  `).run("default-workspace", "Default Workspace");
  db.prepare(`
    INSERT OR IGNORE INTO workspaces (id, name, created_at)
    VALUES (?, ?, datetime('now'));
  `).run("golden-eval-workspace", "Golden Eval Workspace");
}

function ensureAdminUser(passwordHash: string) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Use golden-eval-workspace so the admin user can access the seeded golden docs
  const ADMIN_WORKSPACE = "golden-eval-workspace";

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get("admin@fieldcopilot.com") as { id: string } | undefined;
  if (existing) {
    db.prepare(`UPDATE users SET workspace_id = ?, role = ?, password_hash = ? WHERE id = ?`)
      .run(ADMIN_WORKSPACE, "admin", passwordHash, existing.id);
    return existing.id;
  }

  const userId = randomUUID();
  db.prepare(`
    INSERT INTO users (id, workspace_id, email, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'));
  `).run(userId, ADMIN_WORKSPACE, "admin@fieldcopilot.com", passwordHash, "admin");
  return userId;
}

async function main() {
  ensureCoreSchema();
  ensureWorkspace();
  const passwordHash = await bcrypt.hash("admin123", 10);
  const userId = ensureAdminUser(passwordHash);
  console.log(`[e2e setup] proof db ready at ${dbPath}, admin user id=${userId}`);
  db.close();
}

main().catch((err) => {
  console.error("[e2e setup] failed:", err);
  process.exit(1);
});
