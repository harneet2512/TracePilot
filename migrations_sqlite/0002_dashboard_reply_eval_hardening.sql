-- SQLite-safe dashboard hardening migration.
-- Note: SQLite environments used in tests may already include these columns.

CREATE INDEX IF NOT EXISTS chat_replies_chat_created_idx ON chat_replies(chat_id, created_at);
CREATE INDEX IF NOT EXISTS reply_retrieval_reply_idx ON reply_retrieval_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS reply_citation_reply_idx ON reply_citation_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS reply_llm_eval_reply_idx ON reply_llm_eval_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS reply_tool_reply_idx ON reply_tool_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS enterprise_eval_reply_created_idx ON enterprise_eval_artifacts(reply_id, created_at);
