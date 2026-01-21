# Security Logging Policy

## Overview

FieldCopilot implements PII (Personally Identifiable Information) redaction and security-aware logging to protect user privacy and sensitive data.

## What is Logged

The following events are logged to the `audit_events` table:

1. **Chat Requests** (`kind: "chat"`)
   - User prompt (redacted)
   - LLM response (redacted)
   - Retrieved chunks (source IDs only, content not logged)
   - Citations
   - Latency metrics
   - Trace ID

2. **Action Executions** (`kind: "action_execute"`)
   - Tool proposals (redacted)
   - Tool executions (redacted)
   - Policy check results
   - Approval status
   - Trace ID

3. **Evaluation Runs** (`kind: "eval"`)
   - Eval case prompts (redacted)
   - Eval responses (redacted)
   - Pass/fail status
   - Metrics

4. **Playbook Generation** (`kind: "playbook"`)
   - Incident text (redacted)
   - Generated playbook structure
   - Trace ID

## What is Redacted

The following PII types are automatically redacted before logging:

- **Email addresses**: `user@example.com` → `[EMAIL_REDACTED]`
- **Phone numbers**: `123-456-7890` → `[PHONE_REDACTED]`
- **SSNs**: `123-45-6789` → `[SSN_REDACTED]`
- **Credit cards**: `1234-5678-9012-3456` → `[CREDIT_CARD_REDACTED]`
- **API keys/tokens**: `sk-...` or token formats → `[API_KEY_REDACTED]`
- **Addresses**: `123 Main Street` → `[ADDRESS_REDACTED]`

Redaction preserves the shape and structure of content for debugging while removing sensitive values.

## Implementation

PII redaction is applied:

1. **Before storing audit events** (`server/routes.ts`)
   - Prompts and responses are redacted before insertion into `audit_events` table
   - See `server/lib/safety/redactPII.ts` for implementation

2. **During content sync** (optional, configurable)
   - Slack messages may contain user names/emails
   - Jira issues may contain assignee/reporter emails
   - Confluence pages may contain author information
   - Redaction can be enabled per connector scope

## Retention

- **Local development**: Audit logs are retained indefinitely (local PostgreSQL)
- **Production**: Retention policy should be configured based on compliance requirements
- **Recommendation**: Implement automated cleanup for logs older than 90 days

## Disabling Logging

To disable audit logging:

1. Set environment variable: `DISABLE_AUDIT_LOGGING=true`
2. Or modify `server/routes.ts` to skip `storage.createAuditEvent()` calls

**Note**: Disabling logging reduces observability and compliance capabilities. Only disable for local development or testing.

## Compliance Considerations

- **GDPR**: PII redaction helps with data minimization, but full compliance requires additional measures (right to deletion, data export, etc.)
- **SOC 2**: Audit logging is required for security monitoring
- **HIPAA**: If handling PHI, additional safeguards are required beyond PII redaction

## Security Best Practices

1. **Access Control**: Only admins can view audit logs (`/api/audit` endpoint requires `adminMiddleware`)
2. **Encryption**: Database should use encryption at rest
3. **Network**: Audit logs should only be accessible over secure connections
4. **Monitoring**: Set up alerts for suspicious patterns in audit logs

## Code References

- PII Redaction: `server/lib/safety/redactPII.ts`
- Audit Event Creation: `server/routes.ts` (search for `createAuditEvent`)
- Audit Endpoints: `server/routes.ts:792-814`
