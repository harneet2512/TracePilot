-- Migration: Add workspace boundaries and visibility
-- This migration adds the workspaces table and workspaceId to all relevant tables

-- Step 1: Create workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Step 2: Create default workspace for existing data
INSERT INTO workspaces (id, name, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Workspace', NOW())
ON CONFLICT DO NOTHING;

-- Step 3: Add workspaceId to users (with default)
ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE users SET workspace_id = '00000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE users ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS users_workspace_id_idx ON users(workspace_id);

-- Step 4: Add workspaceId to user_connector_accounts
ALTER TABLE user_connector_accounts ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE user_connector_accounts SET workspace_id = (SELECT workspace_id FROM users WHERE users.id = user_connector_accounts.user_id LIMIT 1) WHERE workspace_id IS NULL;
ALTER TABLE user_connector_accounts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE user_connector_accounts ADD CONSTRAINT user_connector_accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS user_connector_accounts_workspace_id_idx ON user_connector_accounts(workspace_id);

-- Step 5: Add workspaceId to user_connector_scopes
ALTER TABLE user_connector_scopes ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE user_connector_scopes SET workspace_id = (SELECT workspace_id FROM users WHERE users.id = user_connector_scopes.user_id LIMIT 1) WHERE workspace_id IS NULL;
ALTER TABLE user_connector_scopes ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE user_connector_scopes ADD CONSTRAINT user_connector_scopes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS user_connector_scopes_workspace_id_idx ON user_connector_scopes(workspace_id);

-- Step 6: Add workspaceId, visibility, and createdByUserId to sources
ALTER TABLE sources ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
ALTER TABLE sources ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'private';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36);

UPDATE sources SET workspace_id = (SELECT workspace_id FROM users WHERE users.id = sources.user_id LIMIT 1) WHERE workspace_id IS NULL;
UPDATE sources SET created_by_user_id = user_id WHERE created_by_user_id IS NULL;
UPDATE sources SET visibility = 'private' WHERE visibility IS NULL;

ALTER TABLE sources ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE sources ALTER COLUMN created_by_user_id SET NOT NULL;
ALTER TABLE sources ADD CONSTRAINT sources_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE sources ADD CONSTRAINT sources_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
ALTER TABLE sources ADD CONSTRAINT sources_visibility_check CHECK (visibility IN ('private', 'workspace'));

CREATE INDEX IF NOT EXISTS sources_workspace_id_idx ON sources(workspace_id);
CREATE INDEX IF NOT EXISTS sources_created_by_user_id_idx ON sources(created_by_user_id);
CREATE INDEX IF NOT EXISTS sources_visibility_idx ON sources(visibility);

-- Step 7: Add workspaceId to source_versions
ALTER TABLE source_versions ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE source_versions SET workspace_id = (SELECT workspace_id FROM sources WHERE sources.id = source_versions.source_id LIMIT 1) WHERE workspace_id IS NULL;
ALTER TABLE source_versions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE source_versions ADD CONSTRAINT source_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS source_versions_workspace_id_idx ON source_versions(workspace_id);

-- Step 8: Add workspaceId and metadataJson to chunks
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS metadata_json JSONB;
UPDATE chunks SET workspace_id = (SELECT workspace_id FROM sources WHERE sources.id = chunks.source_id LIMIT 1) WHERE workspace_id IS NULL;
ALTER TABLE chunks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE chunks ADD CONSTRAINT chunks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS chunks_workspace_id_idx ON chunks(workspace_id);

-- Step 9: Add workspaceId to traces
ALTER TABLE traces ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE traces SET workspace_id = (SELECT workspace_id FROM users WHERE users.id = traces.user_id LIMIT 1) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
ALTER TABLE traces ADD CONSTRAINT traces_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS traces_workspace_id_idx ON traces(workspace_id);

-- Step 10: Add workspaceId to audit_events and add new kind
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE audit_events SET workspace_id = (SELECT workspace_id FROM users WHERE users.id = audit_events.user_id LIMIT 1) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS audit_events_workspace_id_idx ON audit_events(workspace_id);

-- Step 11: Add workspaceId to approvals
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE approvals SET workspace_id = (SELECT workspace_id FROM users WHERE users.id = approvals.user_id LIMIT 1) WHERE workspace_id IS NULL;
ALTER TABLE approvals ADD CONSTRAINT approvals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
CREATE INDEX IF NOT EXISTS approvals_workspace_id_idx ON approvals(workspace_id);

-- Step 12: Add workspaceId to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE jobs SET workspace_id = (SELECT workspace_id FROM users WHERE users.id = jobs.user_id LIMIT 1) WHERE workspace_id IS NULL AND user_id IS NOT NULL;
ALTER TABLE jobs ADD CONSTRAINT jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS jobs_workspace_id_idx ON jobs(workspace_id);

-- Step 13: Add workspaceId to eval tables
ALTER TABLE eval_suites ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
ALTER TABLE eval_suites ADD CONSTRAINT eval_suites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS eval_suites_workspace_id_idx ON eval_suites(workspace_id);

ALTER TABLE eval_runs ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE eval_runs SET workspace_id = (SELECT workspace_id FROM eval_suites WHERE eval_suites.id = eval_runs.suite_id LIMIT 1) WHERE workspace_id IS NULL;
ALTER TABLE eval_runs ADD CONSTRAINT eval_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS eval_runs_workspace_id_idx ON eval_runs(workspace_id);

ALTER TABLE eval_results ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(36);
UPDATE eval_results SET workspace_id = (SELECT workspace_id FROM eval_runs WHERE eval_runs.id = eval_results.run_id LIMIT 1) WHERE workspace_id IS NULL;
ALTER TABLE eval_results ADD CONSTRAINT eval_results_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS eval_results_workspace_id_idx ON eval_results(workspace_id);
