# AI Enablement Implementation Backlog

The following tickets outline the plan to close the gaps identified in the `INTERNAL_AI_GUARDRAILS_SPEC.md`.

## 1. Cost Governance: Implement Token Budgeting & Quota

**Title**: [AI-OPS-001] Implement Token Budgeting and Rate Limiting per Workspace

**User Story**:
As a Platform Engineer, I want to enforce token limits per workspace so that we can prevent cost overruns and ensure fair usage across teams.

**Acceptance Criteria**:
1.  Create a `TokenTracker` class that tracks `input_tokens` and `output_tokens` per `workspaceId` (Redis or DB backed).
2.  Update `agentCore.ts` to check `TokenTracker.hasBudget(workspaceId)` before calling `chatCompletion`.
3.  If budget is exceeded, return a graceful `429 Too Many Requests` or a polite refusal message.
4.  Add a `MAX_DAILY_TOKENS` environment variable (default: 100k).
5.  Log a `budget_check` span in the trace.

**Suggested Files**:
- `server/lib/observability/tokenTracker.ts` (New)
- `server/lib/agent/agentCore.ts` (Modify `runAgentTurn`)
- `server/storage.ts` (Add usage tracking method)

**Test Plan**:
- Unit test `TokenTracker`: simulate usage and verify rejection.
- Integration test: set budget to 100 tokens, run a query, verify 2nd query fails.

**Telemetry**:
- Metric: `ai_tokens_consumed_total{workspace_id}`
- Log: `Budget exceeded for workspace X`

---

## 2. Standardization: Implement Prompt Registry

**Title**: [AI-OPS-002] Extract System Prompts into Versioned Registry

**User Story**:
As an AI Engineer, I want to manage system prompts outside of the TypeScript code so that we can iterate on prompt engineering without code deployments and track prompt versions.

**Acceptance Criteria**:
1.  Create a `prompts/` directory in the root.
2.  Move the hardcoded system prompt from `agentCore.ts` to `prompts/system_v1.txt`.
3.  Create a `PromptRegistry` class that loads prompts by name and version.
4.  Update `agentCore.ts` to use `PromptRegistry.get("system", "latest")`.
5.  Include the `prompt_version` in the `agentCore` metadata.

**Suggested Files**:
- `server/lib/agent/promptRegistry.ts` (New)
- `server/lib/agent/agentCore.ts`
- `prompts/system_v1.txt` (New)

**Test Plan**:
- Verify agent still responds correctly using file-based prompt.
- Verify `prompt_version` appears in the API response metadata.

**Telemetry**:
- Tag all spans with `prompt_version`.

---

## 3. Lifecycle Management: Model Configuration & Canary Rollout

**Title**: [AI-OPS-003] Externalize Model Configuration and Support Canary Rollouts

**User Story**:
As a Release Manager, I want to configure the LLM model version via configuration (not code) and support split traffic so that I can safely test new models (e.g., GPT-5) on a subset of users.

**Acceptance Criteria**:
1.  Create a `config/models.yaml` file defining available models and rollout rules.
    ```yaml
    default: "gpt-4o"
    canary:
      model: "gpt-4-turbo"
      percent: 10
      users: ["user_123"]
    ```
2.  Create a `ModelConfig` loader.
3.  Update `agentCore.ts` to select the model based on the config and user ID.
4.  Pass the selected model to `chatCompletion`.

**Suggested Files**:
- `server/lib/config/modelConfig.ts` (New)
- `server/lib/agent/agentCore.ts`
- `server/lib/openai.ts` (Update `chatCompletion` to accept `model` param)

**Test Plan**:
- Configure 100% traffic to `gpt-3.5-turbo` (cheaper) to verify config works.
- Configure 50% traffic and run 10 requests, verifying mix of models in logs.

**Telemetry**:
- Tag `llm_completion` span with `model_name`.

---

## 4. Reliability: Circuit Breaker & Retry Logic

**Title**: [AI-OPS-004] Add Circuit Breaker and Exponential Backoff for External Tools

**User Story**:
As a SRE, I want the system to fail fast when external services (Jira, Slack, OpenAI) are down so that we don't cascade failures or hang indefinitely.

**Acceptance Criteria**:
1.  Wrap `chatCompletion` and tool executions (Jira, Slack) in a `CircuitBreaker`.
2.  Configure: 5 failures = Open state (fail fast) for 30 seconds.
3.  Implement exponential backoff retries for 5xx errors (up to 3 retries).
4.  Do NOT retry on 4xx errors (client errors).

**Suggested Files**:
- `server/lib/utils/circuitBreaker.ts` (New)
- `server/lib/agent/agentCore.ts`
- `server/lib/openai.ts`

**Test Plan**:
- Mock OpenAI to fail 5 times -> Verify 6th call fails immediately without network request.
- Verify system recovers after reset timeout.

**Telemetry**:
- Metric: `circuit_breaker_state{service}` (Closed, Open, Half-Open)
- Log: `Circuit breaker opened for service X`

---

## 5. Observability: Define SLIs and SLOs Dashboard

**Title**: [AI-OPS-005] Create Dashboard for Key AI Metrics

**User Story**:
As an Engineering Manager, I want a dashboard showing our key SLIs (Latency, Error Rate, Cost) so that I can monitor the health of the AI service.

**Acceptance Criteria**:
1.  Define Prometheus metrics in `server/lib/observability/prometheus.ts`:
    - `ai_request_duration_seconds` (Histogram)
    - `ai_requests_total` (Counter, labels: status, model)
    - `ai_token_usage_total` (Counter)
    - `ai_policy_denials_total` (Counter)
2.  Instrument `agentCore.ts` to emit these metrics.
3.  Create a Grafana dashboard JSON (or equivalent) visualizing these metrics.

**Suggested Files**:
- `server/lib/observability/prometheus.ts`
- `server/lib/agent/agentCore.ts`
- `dashboards/ai_health.json` (New)

**Test Plan**:
- Run load test.
- Verify metrics appear in `/metrics` endpoint.

**Telemetry**:
- N/A (This is the telemetry task).
