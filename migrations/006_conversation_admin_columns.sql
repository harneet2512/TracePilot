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

CREATE INDEX IF NOT EXISTS conversations_environment_idx ON conversations (environment);
CREATE INDEX IF NOT EXISTS conversations_model_idx ON conversations (model);
