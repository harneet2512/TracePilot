-- Chat quality dashboard schema extensions (SQLite)

ALTER TABLE conversations ADD COLUMN environment TEXT;
ALTER TABLE conversations ADD COLUMN model TEXT;
ALTER TABLE conversations ADD COLUMN model_config_json TEXT;
ALTER TABLE conversations ADD COLUMN retrieval_config_json TEXT;
ALTER TABLE conversations ADD COLUMN entrypoint TEXT;
ALTER TABLE conversations ADD COLUMN app_version TEXT;
ALTER TABLE conversations ADD COLUMN git_sha TEXT;
ALTER TABLE conversations ADD COLUMN final_outcome TEXT;
ALTER TABLE conversations ADD COLUMN error_class TEXT;

ALTER TABLE messages ADD COLUMN tool_call_id TEXT;

CREATE INDEX IF NOT EXISTS conversations_environment_idx ON conversations(environment);
CREATE INDEX IF NOT EXISTS conversations_model_idx ON conversations(model);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at);

CREATE TABLE IF NOT EXISTS chat_replies (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  chat_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
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
  created_at TEXT NOT NULL DEFAULT (now())
);

CREATE INDEX IF NOT EXISTS chat_replies_chat_id_idx ON chat_replies(chat_id);
CREATE INDEX IF NOT EXISTS chat_replies_message_id_idx ON chat_replies(message_id);
CREATE INDEX IF NOT EXISTS chat_replies_trace_id_idx ON chat_replies(trace_id);
CREATE INDEX IF NOT EXISTS chat_replies_created_at_idx ON chat_replies(created_at);
CREATE INDEX IF NOT EXISTS chat_replies_status_idx ON chat_replies(status);

CREATE TABLE IF NOT EXISTS reply_retrieval_artifacts (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  reply_id TEXT NOT NULL REFERENCES chat_replies(id) ON DELETE CASCADE,
  retrieval_mode TEXT,
  top_k INTEGER,
  chunks_returned_count INTEGER,
  sources_returned_count INTEGER,
  top_similarity REAL,
  retrieval_latency_ms INTEGER,
  retrieved_chunks_json TEXT,
  dedup_stats_json TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS reply_retrieval_artifacts_reply_id_idx ON reply_retrieval_artifacts(reply_id);

CREATE TABLE IF NOT EXISTS reply_citation_artifacts (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  reply_id TEXT NOT NULL REFERENCES chat_replies(id) ON DELETE CASCADE,
  citations_json TEXT,
  citation_coverage_rate REAL,
  citation_integrity_rate REAL,
  citation_misattribution_rate REAL,
  repair_applied INTEGER NOT NULL DEFAULT 0,
  repair_notes_json TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS reply_citation_artifacts_reply_id_idx ON reply_citation_artifacts(reply_id);

CREATE TABLE IF NOT EXISTS reply_llm_eval_artifacts (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  reply_id TEXT NOT NULL REFERENCES chat_replies(id) ON DELETE CASCADE,
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
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS reply_llm_eval_artifacts_reply_id_idx ON reply_llm_eval_artifacts(reply_id);

CREATE TABLE IF NOT EXISTS reply_tool_artifacts (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
  reply_id TEXT NOT NULL REFERENCES chat_replies(id) ON DELETE CASCADE,
  tool_calls_json TEXT,
  tool_selection_accuracy REAL,
  parameter_correctness REAL,
  idempotency_key TEXT,
  duplicate_action_detected INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS reply_tool_artifacts_reply_id_idx ON reply_tool_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS reply_tool_artifacts_idempotency_key_idx ON reply_tool_artifacts(idempotency_key);
