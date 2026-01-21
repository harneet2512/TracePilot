CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`audit_event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`draft_json` text NOT NULL,
	`final_json` text,
	`idempotency_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`approved_at` integer,
	`executed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `approvals_workspace_id_idx` ON `approvals` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `approvals_audit_event_id_idx` ON `approvals` (`audit_event_id`);--> statement-breakpoint
CREATE INDEX `approvals_idempotency_key_idx` ON `approvals` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `approvals_user_id_idx` ON `approvals` (`user_id`);--> statement-breakpoint
CREATE INDEX `approvals_status_idx` ON `approvals` (`status`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`request_id` text NOT NULL,
	`trace_id` text,
	`user_id` text,
	`role` text,
	`kind` text NOT NULL,
	`prompt` text,
	`retrieved_json` text,
	`response_json` text,
	`tool_proposals_json` text,
	`tool_executions_json` text,
	`policy_json` text,
	`approval_json` text,
	`success` integer,
	`error` text,
	`latency_ms` text,
	`replay_of` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_workspace_id_idx` ON `audit_events` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `audit_events_user_id_idx` ON `audit_events` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_events_request_id_idx` ON `audit_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `audit_events_trace_id_idx` ON `audit_events` (`trace_id`);--> statement-breakpoint
CREATE INDEX `audit_events_kind_idx` ON `audit_events` (`kind`);--> statement-breakpoint
CREATE INDEX `audit_events_created_at_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text,
	`source_id` text NOT NULL,
	`source_version_id` text,
	`chunk_index` integer NOT NULL,
	`text` text NOT NULL,
	`char_start` integer,
	`char_end` integer,
	`token_estimate` integer,
	`metadata_json` text,
	`vector_ref` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_version_id`) REFERENCES `source_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunks_workspace_id_idx` ON `chunks` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `chunks_source_id_idx` ON `chunks` (`source_id`);--> statement-breakpoint
CREATE INDEX `chunks_source_version_id_idx` ON `chunks` (`source_version_id`);--> statement-breakpoint
CREATE INDEX `chunks_vector_ref_idx` ON `chunks` (`vector_ref`);--> statement-breakpoint
CREATE INDEX `chunks_user_id_idx` ON `chunks` (`user_id`);--> statement-breakpoint
CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`config_json` text NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `eval_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`expected_json` text NOT NULL,
	`tags` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`suite_id`) REFERENCES `eval_suites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `eval_cases_suite_id_idx` ON `eval_cases` (`suite_id`);--> statement-breakpoint
CREATE INDEX `eval_cases_type_idx` ON `eval_cases` (`type`);--> statement-breakpoint
CREATE TABLE `eval_results` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`run_id` text NOT NULL,
	`case_id` text NOT NULL,
	`status` text NOT NULL,
	`actual_json` text,
	`scores_json` text,
	`latency_ms` integer,
	`token_usage` integer,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `eval_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `eval_cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `eval_results_workspace_id_idx` ON `eval_results` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `eval_results_run_id_idx` ON `eval_results` (`run_id`);--> statement-breakpoint
CREATE INDEX `eval_results_case_id_idx` ON `eval_results` (`case_id`);--> statement-breakpoint
CREATE INDEX `eval_results_status_idx` ON `eval_results` (`status`);--> statement-breakpoint
CREATE TABLE `eval_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`suite_id` text NOT NULL,
	`baseline_run_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`channel` text DEFAULT 'http' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`summary_json` text,
	`metrics_json` text,
	`results_json` text,
	`regression_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`suite_id`) REFERENCES `eval_suites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `eval_runs_workspace_id_idx` ON `eval_runs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `eval_runs_suite_id_idx` ON `eval_runs` (`suite_id`);--> statement-breakpoint
CREATE INDEX `eval_runs_status_idx` ON `eval_runs` (`status`);--> statement-breakpoint
CREATE INDEX `eval_runs_channel_idx` ON `eval_runs` (`channel`);--> statement-breakpoint
CREATE TABLE `eval_suites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`name` text NOT NULL,
	`description` text,
	`json_text` text,
	`is_baseline` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `eval_suites_workspace_id_idx` ON `eval_suites` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `job_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_type` text NOT NULL,
	`account_id` text,
	`active_count` integer DEFAULT 0 NOT NULL,
	`max_concurrency` integer DEFAULT 2 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_locks_connector_type_account_idx` ON `job_locks` (`connector_type`,`account_id`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	`error_code` text,
	`stats_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_runs_job_id_idx` ON `job_runs` (`job_id`);--> statement-breakpoint
CREATE INDEX `job_runs_status_idx` ON `job_runs` (`status`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`user_id` text,
	`type` text NOT NULL,
	`connector_type` text,
	`scope_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text,
	`input_json` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`next_run_at` integer NOT NULL,
	`locked_at` integer,
	`locked_by` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_workspace_id_idx` ON `jobs` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `jobs_status_next_run_idx` ON `jobs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `jobs_user_id_idx` ON `jobs` (`user_id`);--> statement-breakpoint
CREATE INDEX `jobs_type_idx` ON `jobs` (`type`);--> statement-breakpoint
CREATE INDEX `jobs_idempotency_key_idx` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_connector_type_idx` ON `jobs` (`connector_type`);--> statement-breakpoint
CREATE TABLE `playbook_items` (
	`id` text PRIMARY KEY NOT NULL,
	`playbook_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`data_json` text,
	`citations_json` text,
	`is_completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`playbook_id`) REFERENCES `playbooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playbook_items_playbook_id_idx` ON `playbook_items` (`playbook_id`);--> statement-breakpoint
CREATE INDEX `playbook_items_kind_idx` ON `playbook_items` (`kind`);--> statement-breakpoint
CREATE TABLE `playbooks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`incident_text` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`trace_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `playbooks_user_id_idx` ON `playbooks` (`user_id`);--> statement-breakpoint
CREATE INDEX `playbooks_status_idx` ON `playbooks` (`status`);--> statement-breakpoint
CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`yaml_text` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`connector_type` text NOT NULL,
	`tokens` integer DEFAULT 10 NOT NULL,
	`max_tokens` integer DEFAULT 10 NOT NULL,
	`refill_rate` integer DEFAULT 1 NOT NULL,
	`last_refill` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_buckets_account_connector_idx` ON `rate_limit_buckets` (`account_id`,`connector_type`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_token_idx` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `source_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`content_hash` text NOT NULL,
	`full_text` text,
	`is_active` integer DEFAULT true NOT NULL,
	`char_count` integer,
	`token_estimate` integer,
	`ingested_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `source_versions_workspace_id_idx` ON `source_versions` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `source_versions_source_id_idx` ON `source_versions` (`source_id`);--> statement-breakpoint
CREATE INDEX `source_versions_content_hash_idx` ON `source_versions` (`content_hash`);--> statement-breakpoint
CREATE INDEX `source_versions_is_active_idx` ON `source_versions` (`is_active`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text,
	`created_by_user_id` text NOT NULL,
	`type` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`url` text,
	`content_hash` text NOT NULL,
	`full_text` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sources_workspace_id_idx` ON `sources` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `sources_user_id_idx` ON `sources` (`user_id`);--> statement-breakpoint
CREATE INDEX `sources_created_by_user_id_idx` ON `sources` (`created_by_user_id`);--> statement-breakpoint
CREATE INDEX `sources_visibility_idx` ON `sources` (`visibility`);--> statement-breakpoint
CREATE INDEX `sources_external_id_user_idx` ON `sources` (`external_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `sources_type_idx` ON `sources` (`type`);--> statement-breakpoint
CREATE INDEX `sources_content_hash_idx` ON `sources` (`content_hash`);--> statement-breakpoint
CREATE TABLE `spans` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`parent_span_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`duration_ms` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`model` text,
	`retrieval_count` integer,
	`similarity_min` real,
	`similarity_max` real,
	`similarity_avg` real,
	`error` text,
	`error_code` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trace_id`) REFERENCES `traces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spans_trace_id_idx` ON `spans` (`trace_id`);--> statement-breakpoint
CREATE INDEX `spans_kind_idx` ON `spans` (`kind`);--> statement-breakpoint
CREATE INDEX `spans_parent_span_id_idx` ON `spans` (`parent_span_id`);--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`user_id` text,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`duration_ms` integer,
	`error` text,
	`metadata_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `traces_workspace_id_idx` ON `traces` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `traces_user_id_idx` ON `traces` (`user_id`);--> statement-breakpoint
CREATE INDEX `traces_request_id_idx` ON `traces` (`request_id`);--> statement-breakpoint
CREATE INDEX `traces_kind_idx` ON `traces` (`kind`);--> statement-breakpoint
CREATE INDEX `traces_created_at_idx` ON `traces` (`created_at`);--> statement-breakpoint
CREATE INDEX `traces_status_idx` ON `traces` (`status`);--> statement-breakpoint
CREATE TABLE `user_connector_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expires_at` integer,
	`scopes_json` text,
	`external_account_id` text,
	`metadata_json` text,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_sync_at` integer,
	`last_sync_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_connector_accounts_workspace_id_idx` ON `user_connector_accounts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `user_connector_accounts_user_id_idx` ON `user_connector_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_connector_accounts_type_idx` ON `user_connector_accounts` (`type`);--> statement-breakpoint
CREATE TABLE `user_connector_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`scope_config_json` text NOT NULL,
	`sync_mode` text DEFAULT 'metadata_first' NOT NULL,
	`content_strategy` text DEFAULT 'smart' NOT NULL,
	`exclusions_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `user_connector_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_connector_scopes_workspace_id_idx` ON `user_connector_scopes` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `user_connector_scopes_account_id_idx` ON `user_connector_scopes` (`account_id`);--> statement-breakpoint
CREATE INDEX `user_connector_scopes_user_id_idx` ON `user_connector_scopes` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_workspace_id_idx` ON `users` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `voice_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`caller_number` text,
	`metadata_json` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_calls_user_id_idx` ON `voice_calls` (`user_id`);--> statement-breakpoint
CREATE INDEX `voice_calls_status_idx` ON `voice_calls` (`status`);--> statement-breakpoint
CREATE TABLE `voice_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`trace_id` text,
	`turn_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`call_id`) REFERENCES `voice_calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_turns_call_id_idx` ON `voice_turns` (`call_id`);--> statement-breakpoint
CREATE INDEX `voice_turns_trace_id_idx` ON `voice_turns` (`trace_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
