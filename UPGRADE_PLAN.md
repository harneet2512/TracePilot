# Portfolio Upgrade Plan - File Changes

## Files to Create

1. `server/lib/safety/sanitize.ts` - Prompt injection sanitization
2. `server/lib/safety/detector.ts` - Injection detection heuristics
3. `server/lib/safety/redactPII.ts` - PII redaction/masking
4. `server/lib/safety/__tests__/sanitize.test.ts` - Tests for sanitize
5. `server/lib/safety/__tests__/redactPII.test.ts` - Tests for PII redaction
6. `EVAL_RUBRIC.md` - Evaluation rubric document
7. `SECURITY_LOGGING.md` - Security logging policy
8. `ONBOARDING_PLAYBOOK.md` - Customer onboarding playbook
9. `WORKSHOP_MATERIALS.md` - Workshop materials
10. `.github/workflows/ci.yml` - CI/CD pipeline

## Files to Modify

1. `server/lib/sync/jiraSync.ts` - Apply sanitization to content
2. `server/lib/sync/confluenceSync.ts` - Apply sanitization to content
3. `server/lib/sync/slackSync.ts` - Apply sanitization + PII redaction
4. `server/routes.ts` - Apply sanitization to prompt construction, PII redaction to audit logs
5. `shared/schema.ts` - Add rubric fields to evalCases.expectedJson
6. `script/seed-evals.ts` - Expand to 50-100 cases with rubric-aware fields
7. `server/routes.ts` (runEvalCases) - Make rubric-aware evaluation
8. `script/ci-gate.ts` - Improve output with diff table and report artifacts
9. `server/routes.ts` - Add GET /api/eval-runs/:id/diff endpoint
10. `README.md` - Add CI pipeline section, quickstart for Digital Native teams
11. `package.json` - Add test scripts if needed

## Implementation Order

1. Step 1: Safety - Prompt injection defenses
2. Step 2: Safety - PII handling
3. Step 3: Evals - Rubric + expanded dataset
4. Step 4: Regression diff improvements
5. Step 5: CI/CD pipeline
6. Step 6: Customer-facing packaging
7. Step 7: Final audit
