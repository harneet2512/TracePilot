CREATE TABLE "approvals" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_event_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"tool_name" text NOT NULL,
	"draft_json" jsonb NOT NULL,
	"final_json" jsonb,
	"idempotency_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"approved_at" timestamp,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" varchar(36) NOT NULL,
	"trace_id" varchar(36),
	"user_id" varchar(36),
	"role" text,
	"kind" text NOT NULL,
	"prompt" text,
	"retrieved_json" jsonb,
	"response_json" jsonb,
	"tool_proposals_json" jsonb,
	"tool_executions_json" jsonb,
	"policy_json" jsonb,
	"approval_json" jsonb,
	"success" boolean,
	"error" text,
	"latency_ms" jsonb,
	"replay_of" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36),
	"source_id" varchar(36) NOT NULL,
	"source_version_id" varchar(36),
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"char_start" integer,
	"char_end" integer,
	"token_estimate" integer,
	"vector_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"config_json" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suite_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"expected_json" jsonb NOT NULL,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar(36) NOT NULL,
	"case_id" varchar(36) NOT NULL,
	"status" text NOT NULL,
	"actual_json" jsonb,
	"scores_json" jsonb,
	"latency_ms" integer,
	"token_usage" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suite_id" varchar(36) NOT NULL,
	"baseline_run_id" varchar(36),
	"status" text DEFAULT 'running' NOT NULL,
	"channel" text DEFAULT 'http' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"summary_json" jsonb,
	"metrics_json" jsonb,
	"results_json" jsonb,
	"regression_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_suites" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"json_text" text,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar(36) NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"error" text,
	"error_code" text,
	"stats_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36),
	"type" text NOT NULL,
	"connector_type" text,
	"scope_id" varchar(36),
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"input_json" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"locked_by" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playbook_id" varchar(36) NOT NULL,
	"order_index" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"data_json" jsonb,
	"citations_json" jsonb,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"title" text NOT NULL,
	"incident_text" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"trace_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"yaml_text" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "source_versions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content_hash" text NOT NULL,
	"full_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"char_count" integer,
	"token_estimate" integer,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36),
	"type" text NOT NULL,
	"external_id" varchar(255),
	"title" text NOT NULL,
	"url" text,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spans" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" varchar(36) NOT NULL,
	"parent_span_id" varchar(36),
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"duration_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"model" text,
	"retrieval_count" integer,
	"similarity_min" real,
	"similarity_max" real,
	"similarity_avg" real,
	"error" text,
	"error_code" text,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36),
	"request_id" varchar(36) NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"duration_ms" integer,
	"error" text,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_connector_accounts" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp,
	"scopes_json" jsonb,
	"external_account_id" text,
	"metadata_json" jsonb,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_sync_at" timestamp,
	"last_sync_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_connector_scopes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" text NOT NULL,
	"scope_config_json" jsonb NOT NULL,
	"sync_mode" text DEFAULT 'metadata_first' NOT NULL,
	"content_strategy" text DEFAULT 'smart' NOT NULL,
	"exclusions_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_audit_event_id_audit_events_id_fk" FOREIGN KEY ("audit_event_id") REFERENCES "public"."audit_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_source_version_id_source_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_suite_id_eval_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."eval_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_case_id_eval_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_id_eval_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."eval_suites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_items" ADD CONSTRAINT "playbook_items_playbook_id_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbooks" ADD CONSTRAINT "playbooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_versions" ADD CONSTRAINT "source_versions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spans" ADD CONSTRAINT "spans_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connector_accounts" ADD CONSTRAINT "user_connector_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connector_scopes" ADD CONSTRAINT "user_connector_scopes_account_id_user_connector_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_connector_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connector_scopes" ADD CONSTRAINT "user_connector_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_audit_event_id_idx" ON "approvals" USING btree ("audit_event_id");--> statement-breakpoint
CREATE INDEX "approvals_idempotency_key_idx" ON "approvals" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "approvals_user_id_idx" ON "approvals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_events_user_id_idx" ON "audit_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_events_request_id_idx" ON "audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_events_trace_id_idx" ON "audit_events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "audit_events_kind_idx" ON "audit_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chunks_source_id_idx" ON "chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "chunks_source_version_id_idx" ON "chunks" USING btree ("source_version_id");--> statement-breakpoint
CREATE INDEX "chunks_vector_ref_idx" ON "chunks" USING btree ("vector_ref");--> statement-breakpoint
CREATE INDEX "chunks_user_id_idx" ON "chunks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "eval_cases_suite_id_idx" ON "eval_cases" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "eval_cases_type_idx" ON "eval_cases" USING btree ("type");--> statement-breakpoint
CREATE INDEX "eval_results_run_id_idx" ON "eval_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "eval_results_case_id_idx" ON "eval_results" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "eval_results_status_idx" ON "eval_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eval_runs_suite_id_idx" ON "eval_runs" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "eval_runs_status_idx" ON "eval_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "eval_runs_channel_idx" ON "eval_runs" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "job_runs_job_id_idx" ON "job_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_runs_status_idx" ON "job_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_status_next_run_idx" ON "jobs" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "jobs_user_id_idx" ON "jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "jobs_type_idx" ON "jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "jobs_idempotency_key_idx" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_connector_type_idx" ON "jobs" USING btree ("connector_type");--> statement-breakpoint
CREATE INDEX "playbook_items_playbook_id_idx" ON "playbook_items" USING btree ("playbook_id");--> statement-breakpoint
CREATE INDEX "playbook_items_kind_idx" ON "playbook_items" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "playbooks_user_id_idx" ON "playbooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "playbooks_status_idx" ON "playbooks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_versions_source_id_idx" ON "source_versions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_versions_content_hash_idx" ON "source_versions" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "source_versions_is_active_idx" ON "source_versions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sources_user_id_idx" ON "sources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sources_external_id_user_idx" ON "sources" USING btree ("external_id","user_id");--> statement-breakpoint
CREATE INDEX "sources_type_idx" ON "sources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "spans_trace_id_idx" ON "spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "spans_kind_idx" ON "spans" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "spans_parent_span_id_idx" ON "spans" USING btree ("parent_span_id");--> statement-breakpoint
CREATE INDEX "traces_user_id_idx" ON "traces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "traces_request_id_idx" ON "traces" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "traces_kind_idx" ON "traces" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "traces_created_at_idx" ON "traces" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "traces_status_idx" ON "traces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_connector_accounts_user_id_idx" ON "user_connector_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_connector_accounts_type_idx" ON "user_connector_accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "user_connector_scopes_account_id_idx" ON "user_connector_scopes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "user_connector_scopes_user_id_idx" ON "user_connector_scopes" USING btree ("user_id");