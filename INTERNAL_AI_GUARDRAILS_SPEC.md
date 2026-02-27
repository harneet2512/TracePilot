# Internal AI Guardrails Specification

## 1. Repo Guardrails Inventory

The following guardrails are currently implemented in the `TracePilot` codebase:

| Category | Policy Intent | Enforcement Mechanism | Failure Mode Prevented | Telemetry Emitted | Coverage Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Content Safety** | prevent prompt injection attacks | `detectInjection` (regex/keyword scoring) in `server/lib/safety/detector.ts`. Called in `agentCore.ts` before LLM. | Role hijacking, instruction override | `injection_detection` span (score, reasons) | **Implemented** |
| **Data Safety** | Redact PII from logs and storage | `redactPII` (regex for email, SSN, API keys) in `server/lib/safety/redactPII.ts`. Used in `agentCore.ts` for audit events. | PII leakage in logs | Audit logs contain `[REDACTED]` placeholders | **Implemented** |
| **Input Validation** | Sanitize user input | `sanitizeContent` (strip markers, limit length) in `server/lib/safety/sanitize.ts`. | Buffer overflow, malicious payload injection | `markersRemoved` count in metadata | **Implemented** |
| **Tool Governance** | Restrict tool usage by role | `checkPolicy` in `server/lib/policy/checker.ts`. Validates role permissions and tool constraints. | Unauthorized actions, privilege escalation | `policy_check` span (allowed/denied reason) | **Implemented** |
| **Observability** | Full audit trail and tracing | `traceCtx` spans and `storage.createAuditEvent` in `agentCore.ts`. | Silent failures, lack of accountability | Trace spans (latency, tokens), Audit events | **Implemented** |
| **Retrieval** | Ground answers in trusted docs | `validateAndAttribute` in `server/lib/rag/grounding.ts`. Verifies logic against citations. | Hallucinations, ungrounded claims | `retrieval` span, `evidence` in response | **Partial** (Doc-intent only) |
| **Output Repair** | Ensure valid JSON output | `validateWithRepair` in `jsonRepair`. Retries on malformed JSON. | Broken UI/API responses | `json_repair` span | **Implemented** |

## 2. Guardrails Taxonomy

### 1. Access and Identity
*   **Status**: Partial
*   **Current State**: Basic user role (`admin` | `member`) check in `agentCore.ts`. `oauth.ts` handles authentication.
*   **Gap**: No granular RBAC beyond basic roles. No service-to-service auth documented in policy.

### 2. Data Safety
*   **Status**: Strong
*   **Current State**: Comprehensive PII redaction for emails, phones, SSNs, Credit Cards, API keys. `sanitize.ts` for input cleaning.
*   **Gap**: No DLP for custom enterprise entities (e.g., proprietary project codes).

### 3. Tool Governance
*   **Status**: Strong
*   **Current State**: `policy/checker.ts` enforces allowlists for tools, Jira projects, Slack channels, Confluence spaces.
*   **Gap**: No rate limiting per tool.

### 4. State and Reliability
*   **Status**: Partial
*   **Current State**: JSON repair logic.
*   **Gap**: No circuit breakers for external APIs (Jira, Slack). No exponential backoff for LLM retries beyond JSON repair. No timeout configuration.

### 5. Prompt Governance
*   **Status**: Missing
*   **Current State**: System prompt hardcoded in `agentCore.ts`.
*   **Gap**: No Prompt Registry. No version control for prompts independent of code. No approval workflow for prompt changes.

### 6. Model Lifecycle
*   **Status**: Weak
*   **Current State**: Hardcoded model (`gpt-4o`). Offline eval script exists.
*   **Gap**: No canary rollout capability. No dynamic model routing. No deprecation path.

### 7. Observability
*   **Status**: Strong
*   **Current State**: Distributed tracing (spans for every step), structured logging, detailed audit events.
*   **Gap**: No aggregated dashboards or alert rules defined.

### 8. Cost Governance
*   **Status**: Missing
*   **Current State**: `tokensEstimate` calculated but not acted upon.
*   **Gap**: No budget enforcement. No per-user or per-workspace quota. No chargeback tagging.

### 9. Human Oversight
*   **Status**: Partial
*   **Current State**: Policy can return `requiresApproval`.
*   **Gap**: Approval workflow (UI/API) not fully visible in core agent logic (relies on client handling).

### 10. Compliance Posture
*   **Status**: Strong
*   **Current State**: Comprehensive audit logging with redacted inputs/outputs.
*   **Gap**: Data provenance tracking could be more granular (e.g., specific chunk versions).

## 3. Gap Analysis (Gong-level Readiness)

| Gap Area | Risk Level | Description | Recommended Change |
| :--- | :--- | :--- | :--- |
| **Cost Governance** | High | No controls on token usage. A single loop could drain budget. | Implement `TokenBucket` rate limiter and monthly budget checks in `agentCore.ts`. |
| **Lifecycle Management** | High | Hardcoded model versions make upgrades risky and "big bang". | Extract model config to `model_registry.yaml` with canary % support. |
| **Standardization** | Medium | Prompts buried in code make it hard for non-engineers to iterate. | Move prompts to `prompts/` directory or a registry with versioning. |
| **SLA/SLO** | Medium | No defined targets for latency or error rates. | Define official SLOs (e.g., <5s p95 latency for chat) and add alerts. |

## 4. Guardrails Specification

### Principles
1.  **Safe by Default**: All tools and data access are denied unless explicitly allowed.
2.  **Defense in Depth**: Multiple layers of protection (Regex -> LLM Validator -> Policy Check).
3.  **Transparent & Auditable**: Every decision, retrieval, and action is logged with trace IDs.
4.  **Fail Gracefully**: If a guardrail fails or is unreachable, the system fails closed (denies action).

### Policy Matrix

| Guardrail | Owner | Enforcement | Evidence |
| :--- | :--- | :--- | :--- |
| **Prompt Injection** | Security Eng | `detectInjection` (Pre-LLM) | Audit Log `injection_score` |
| **PII Leakage** | Compliance | `redactPII` (Post-LLM, Logging) | Audit Log `[REDACTED]` tags |
| **Tool Authorization** | Platform Eng | `checkPolicy` (Pre-Tool) | `policy_check` Trace Span |
| **Citation Grounding** | AI Research | `validateAndAttribute` (Post-Retrieval) | Citation metadata in response |
| **Token Budget** | FinOps | `TokenLimiter` (Pre-Request) | `429` Response Code |

### Service Level Indicators (SLIs) & Objectives (SLOs)

| Metric | Definition | SLO (Target) |
| :--- | :--- | :--- |
| **Chat Latency** | Time from request to first token (TTFT) | 95% < 2000ms |
| **E2E Latency** | Time from request to full response | 99% < 10s |
| **Availability** | % of non-5xx responses | 99.9% |
| **Groundedness** | % of citation-backed claims (offline eval) | > 90% |
| **Tool Success Rate** | % of tool calls executed successfully | > 98% |

### Incident Response & Runbooks

*   **P0: Injection Attack Detected**: 
    1.  Alert triggers on `injection_score > 80`.
    2.  Block user ID temporarily.
    3.  Rotate system prompt if bypass found.
*   **P1: Model hallucinations spike**:
    1.  Rollback to previous model version via config.
    2.  Disable `grounding_strict` mode if availability is critical, or fail requests if accuracy is critical.
*   **P2: Budget Exceeded**:
    1.  Trigger "Soft Cap" alert at 80%.
    2.  At 100%, switch to "fallback" model (cheaper) or degrade service (no tools).

### Model Lifecycle Plan

1.  **Development**: Local `eval/` runs against `golden` dataset.
2.  **Staging**: Canary deployment to 5% of internal users.
3.  **Production**: Gradual rollout (10% -> 50% -> 100%).
4.  **Deprecation**: Old versions supported for 30 days post-deprecation notice.

### Cost Governance Plan

*   **Token Metering**: Track `input_tokens` and `output_tokens` per `workspaceId`.
*   **Budgets**: 
    *   `Free`: 100k tokens/month
    *   `Pro`: 1M tokens/month
    *   `Enterprise`: Custom
*   **Forecasting**: Daily usage report to slack channel `#ai-ops-cost`.
*   **Tagging**: All LLM calls tagged with `environment`, `feature`, `user_id`.
