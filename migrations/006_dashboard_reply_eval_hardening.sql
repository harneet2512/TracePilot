-- Dashboard hardening for production/chat quality/eval explainability
-- Safe additive migration.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS environment text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS model_config_json jsonb;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS retrieval_config_json jsonb;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS entrypoint text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS git_sha text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS final_outcome text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS error_class text;

CREATE INDEX IF NOT EXISTS conversations_environment_idx ON conversations(environment);
CREATE INDEX IF NOT EXISTS conversations_model_idx ON conversations(model);
CREATE INDEX IF NOT EXISTS chat_replies_chat_created_idx ON chat_replies(chat_id, created_at);
CREATE INDEX IF NOT EXISTS reply_retrieval_reply_idx ON reply_retrieval_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS reply_citation_reply_idx ON reply_citation_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS reply_llm_eval_reply_idx ON reply_llm_eval_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS reply_tool_reply_idx ON reply_tool_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS enterprise_eval_reply_created_idx ON enterprise_eval_artifacts(reply_id, created_at);
