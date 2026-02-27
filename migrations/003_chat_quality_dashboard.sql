-- Chat quality dashboard schema extensions

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS environment TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model_config_json JSONB;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS retrieval_config_json JSONB;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS entrypoint TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS git_sha TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS final_outcome TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS error_class TEXT;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS tool_call_id TEXT;

CREATE INDEX IF NOT EXISTS conversations_environment_idx ON conversations(environment);
CREATE INDEX IF NOT EXISTS conversations_model_idx ON conversations(model);
CREATE INDEX IF NOT EXISTS conversations_created_at_idx ON conversations(created_at);

CREATE TABLE IF NOT EXISTS chat_replies (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id VARCHAR(36) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id VARCHAR(36) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  latency_ms INTEGER,
  ttft_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  status TEXT NOT NULL DEFAULT 'ok',
  error_type TEXT,
  trace_id VARCHAR(36),
  streamed BOOLEAN NOT NULL DEFAULT TRUE,
  scored BOOLEAN NOT NULL DEFAULT FALSE,
  scored_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_replies_chat_id_idx ON chat_replies(chat_id);
CREATE INDEX IF NOT EXISTS chat_replies_message_id_idx ON chat_replies(message_id);
CREATE INDEX IF NOT EXISTS chat_replies_trace_id_idx ON chat_replies(trace_id);
CREATE INDEX IF NOT EXISTS chat_replies_created_at_idx ON chat_replies(created_at);
CREATE INDEX IF NOT EXISTS chat_replies_status_idx ON chat_replies(status);

CREATE TABLE IF NOT EXISTS reply_retrieval_artifacts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id VARCHAR(36) NOT NULL REFERENCES chat_replies(id) ON DELETE CASCADE,
  retrieval_mode TEXT,
  top_k INTEGER,
  chunks_returned_count INTEGER,
  sources_returned_count INTEGER,
  top_similarity REAL,
  retrieval_latency_ms INTEGER,
  retrieved_chunks_json JSONB,
  dedup_stats_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reply_retrieval_artifacts_reply_id_idx ON reply_retrieval_artifacts(reply_id);

CREATE TABLE IF NOT EXISTS reply_citation_artifacts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id VARCHAR(36) NOT NULL REFERENCES chat_replies(id) ON DELETE CASCADE,
  citations_json JSONB,
  citation_coverage_rate REAL,
  citation_integrity_rate REAL,
  citation_misattribution_rate REAL,
  repair_applied BOOLEAN NOT NULL DEFAULT FALSE,
  repair_notes_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reply_citation_artifacts_reply_id_idx ON reply_citation_artifacts(reply_id);

CREATE TABLE IF NOT EXISTS reply_llm_eval_artifacts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id VARCHAR(36) NOT NULL REFERENCES chat_replies(id) ON DELETE CASCADE,
  claims_json JSONB,
  claim_labels_json JSONB,
  grounded_claim_rate REAL,
  unsupported_claim_rate REAL,
  contradiction_rate REAL,
  completeness_score REAL,
  missing_points_json JSONB,
  answer_relevance_score REAL,
  context_relevance_score REAL,
  context_recall_score REAL,
  low_evidence_calibration_json JSONB,
  format_valid_rate REAL,
  judge_model TEXT,
  judge_version TEXT,
  judge_rationales_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reply_llm_eval_artifacts_reply_id_idx ON reply_llm_eval_artifacts(reply_id);

CREATE TABLE IF NOT EXISTS reply_tool_artifacts (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id VARCHAR(36) NOT NULL REFERENCES chat_replies(id) ON DELETE CASCADE,
  tool_calls_json JSONB,
  tool_selection_accuracy REAL,
  parameter_correctness REAL,
  idempotency_key TEXT,
  duplicate_action_detected BOOLEAN NOT NULL DEFAULT FALSE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reply_tool_artifacts_reply_id_idx ON reply_tool_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS reply_tool_artifacts_idempotency_key_idx ON reply_tool_artifacts(idempotency_key);
