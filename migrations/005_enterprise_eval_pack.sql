CREATE TABLE IF NOT EXISTS enterprise_eval_artifacts (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id varchar(36) REFERENCES chat_replies(id) ON DELETE CASCADE,
  run_id varchar(36) REFERENCES eval_runs(id) ON DELETE CASCADE,
  eval_pack_version text NOT NULL DEFAULT 'v1',

  evidence_coverage_score real,
  evidence_coverage_pass boolean,
  evidence_coverage_rationale text,
  evidence_coverage_map_json jsonb,

  evidence_sufficiency_score real,
  evidence_sufficiency_pass boolean,
  evidence_sufficiency_rationale text,
  evidence_sufficiency_details_json jsonb,

  multihop_trace_score real,
  multihop_trace_pass boolean,
  multihop_trace_rationale text,
  multihop_trace_json jsonb,

  directness_score real,
  directness_pass boolean,
  directness_rationale text,
  actionability_score real,
  actionability_pass boolean,
  actionability_rationale text,

  clarity_score real,
  clarity_pass boolean,
  clarity_rationale text,
  clarity_details_json jsonb,

  followup_quality_score real,
  followup_quality_pass boolean,
  followup_quality_rationale text,

  source_scope_pass boolean,
  source_scope_score real,
  source_scope_rationale text,
  source_scope_violations_json jsonb,

  missing_data_hallucination_pass boolean,
  missing_data_hallucination_score real,
  missing_data_hallucination_rationale text,

  pii_leak_pass boolean,
  pii_leak_score real,
  pii_leak_rationale text,
  pii_leak_findings_json jsonb,

  stability_variance real,
  stability_pass boolean,
  stability_rationale text,
  stability_details_json jsonb,

  retrieval_drift_score real,
  retrieval_drift_pass boolean,
  retrieval_drift_rationale text,
  retrieval_drift_json jsonb,

  citation_ui_readiness_score real,
  citation_ui_readiness_pass boolean,
  citation_ui_readiness_rationale text,
  citation_ui_details_json jsonb,

  debug_panel_completeness_score real,
  debug_panel_completeness_pass boolean,
  debug_panel_completeness_rationale text,
  debug_panel_missing_json jsonb,

  overall_score real,
  overall_pass boolean,
  summary_json jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enterprise_eval_artifacts_reply_id_idx ON enterprise_eval_artifacts(reply_id);
CREATE INDEX IF NOT EXISTS enterprise_eval_artifacts_run_id_idx ON enterprise_eval_artifacts(run_id);
CREATE INDEX IF NOT EXISTS enterprise_eval_artifacts_created_at_idx ON enterprise_eval_artifacts(created_at);

ALTER TABLE reply_llm_eval_artifacts ADD COLUMN IF NOT EXISTS directness_score real;
ALTER TABLE reply_llm_eval_artifacts ADD COLUMN IF NOT EXISTS clarity_score real;
ALTER TABLE reply_llm_eval_artifacts ADD COLUMN IF NOT EXISTS followup_quality_score real;
