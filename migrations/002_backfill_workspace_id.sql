-- Migration: Fix workspaceId defaults and backfill nulls
-- This migration ensures workspaceId is never null in sources, chunks, and jobs

-- 1. Backfill jobs with null workspaceId
UPDATE jobs SET workspace_id = 'default-workspace' WHERE workspace_id IS NULL;

-- 2. Backfill sources with null workspaceId (shouldn't happen but safety)
UPDATE sources SET workspace_id = 'default-workspace' WHERE workspace_id IS NULL;

-- 3. Backfill source_versions with null workspaceId
UPDATE source_versions SET workspace_id = 'default-workspace' WHERE workspace_id IS NULL;

-- 4. Backfill chunks with null workspaceId
UPDATE chunks SET workspace_id = 'default-workspace' WHERE workspace_id IS NULL;

-- 5. Backfill user_connector_scopes with null workspaceId
UPDATE user_connector_scopes SET workspace_id = 'default-workspace' WHERE workspace_id IS NULL;

-- 6. Backfill sources.created_by_user_id if null (use userId from scope or admin-user-id)
-- This is a safety backfill - shouldn't happen with properly working sync
UPDATE sources s
SET created_by_user_id = COALESCE(
  s.user_id,
  (SELECT user_id FROM user_connector_scopes ucs WHERE (s.metadata_json->>'scopeId')::text = ucs.id LIMIT 1),
  (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
)
WHERE s.created_by_user_id IS NULL;

-- Log count of backfilled rows
DO $$
DECLARE
  jobs_count INTEGER;
  sources_count INTEGER;
  chunks_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO jobs_count FROM jobs WHERE workspace_id = 'default-workspace';
  SELECT COUNT(*) INTO sources_count FROM sources WHERE workspace_id = 'default-workspace';
  SELECT COUNT(*) INTO chunks_count FROM chunks WHERE workspace_id = 'default-workspace';
  
  RAISE NOTICE 'Backfill complete: jobs=%, sources=%, chunks=%', jobs_count, sources_count, chunks_count;
END $$;
