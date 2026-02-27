ALTER TABLE eval_suites ADD COLUMN IF NOT EXISTS baseline_run_id varchar(36);
ALTER TABLE eval_suites ADD COLUMN IF NOT EXISTS thresholds_json jsonb;

ALTER TABLE eval_runs ADD COLUMN IF NOT EXISTS git_sha varchar(80);
ALTER TABLE eval_runs ADD COLUMN IF NOT EXISTS env text;
ALTER TABLE eval_runs ADD COLUMN IF NOT EXISTS model text;

ALTER TABLE eval_results ADD COLUMN IF NOT EXISTS artifacts_json jsonb;

CREATE INDEX IF NOT EXISTS eval_runs_suite_created_idx ON eval_runs (suite_id, created_at);
