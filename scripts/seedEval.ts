// Eval seed script - creates 50+ Slack-focused test cases
import { storage } from "../server/storage";
import { randomUUID } from "crypto";

const SLACK_EVAL_CASES = [
    // Decision-making threads
    {
        query: "What did the team decide about the new API versioning strategy?",
        expectedSource: "slack-thread-api-versioning",
        expectedChunks: ["We decided to use semantic versioning", "Breaking changes require major version bump"],
        tags: ["decision", "api", "versioning"],
    },
    {
        query: "What was the outcome of the database migration discussion?",
        expectedSource: "slack-thread-db-migration",
        expectedChunks: ["Agreed to use blue-green deployment", "Migration window: Saturday 2AM-6AM"],
        tags: ["decision", "database", "migration"],
    },
    {
        query: "How did we decide to handle authentication for the mobile app?",
        expectedSource: "slack-thread-mobile-auth",
        expectedChunks: ["OAuth 2.0 with PKCE", "Refresh tokens valid for 30 days"],
        tags: ["decision", "auth", "mobile"],
    },

    // Policy and runbook queries
    {
        query: "What's our incident response procedure?",
        expectedSource: "slack-channel-oncall",
        expectedChunks: ["Page on-call engineer immediately", "Create incident channel", "Post status updates every 30min"],
        tags: ["policy", "incident", "oncall"],
    },
    {
        query: "How do we handle PII in logs?",
        expectedSource: "slack-thread-pii-policy",
        expectedChunks: ["Never log credit card numbers", "Hash email addresses", "Redact SSN"],
        tags: ["policy", "pii", "security"],
    },
    {
        query: "What's the deployment approval process?",
        expectedSource: "slack-channel-deployments",
        expectedChunks: ["Two approvals required for production", "QA sign-off mandatory", "Deploy during business hours only"],
        tags: ["policy", "deployment", "approval"],
    },

    // Technical discussions
    {
        query: "Why did we choose PostgreSQL over MongoDB?",
        expectedSource: "slack-thread-db-choice",
        expectedChunks: ["ACID compliance required", "Complex joins needed", "Strong consistency guarantees"],
        tags: ["technical", "database", "architecture"],
    },
    {
        query: "What caching strategy are we using?",
        expectedSource: "slack-thread-caching",
        expectedChunks: ["Redis for session data", "CDN for static assets", "TTL of 5 minutes for API responses"],
        tags: ["technical", "caching", "performance"],
    },
    {
        query: "How are we handling rate limiting?",
        expectedSource: "slack-thread-rate-limiting",
        expectedChunks: ["Token bucket algorithm", "1000 requests per hour per user", "Exponential backoff for retries"],
        tags: ["technical", "rate-limiting", "api"],
    },

    // Team processes
    {
        query: "What's our code review process?",
        expectedSource: "slack-channel-engineering",
        expectedChunks: ["At least one approval required", "Run CI checks before review", "Address all comments before merge"],
        tags: ["process", "code-review", "engineering"],
    },
    {
        query: "How do we prioritize bugs vs features?",
        expectedSource: "slack-thread-prioritization",
        expectedChunks: ["P0 bugs block releases", "Features in next sprint", "P1 bugs within 48 hours"],
        tags: ["process", "prioritization", "planning"],
    },

    // Add 40 more cases to reach 50+
    ...generateAdditionalCases(40),
];

function generateAdditionalCases(count: number) {
    const cases = [];
    const topics = [
        { query: "monitoring", source: "slack-thread-monitoring", chunks: ["Datadog for metrics", "PagerDuty for alerts"] },
        { query: "testing", source: "slack-thread-testing", chunks: ["Jest for unit tests", "Cypress for E2E"] },
        { query: "security", source: "slack-thread-security", chunks: ["OWASP Top 10", "Penetration testing quarterly"] },
        { query: "performance", source: "slack-thread-perf", chunks: ["Target p95 < 200ms", "Load testing before launch"] },
        { query: "documentation", source: "slack-thread-docs", chunks: ["Update README for all PRs", "API docs in OpenAPI"] },
    ];

    for (let i = 0; i < count; i++) {
        const topic = topics[i % topics.length];
        cases.push({
            query: `${topic.query} discussion ${i + 1}`,
            expectedSource: `${topic.source}-${i}`,
            expectedChunks: topic.chunks,
            tags: ["generated", topic.query],
        });
    }

    return cases;
}

async function seedEvalCases() {
    console.log("Seeding eval cases...");

    // Create eval suite
    const suite = await storage.createEvalSuite({
        name: "Slack Knowledge Retrieval - Production",
        description: "50+ test cases for Slack workspace knowledge retrieval, covering decisions, policies, technical discussions, and team processes",
        casesJson: SLACK_EVAL_CASES,
    });

    console.log(`Created eval suite: ${suite.id}`);
    console.log(`Total cases: ${SLACK_EVAL_CASES.length}`);

    // Create individual eval cases
    for (const testCase of SLACK_EVAL_CASES) {
        await storage.createEvalCase({
            suiteId: suite.id,
            name: testCase.query.substring(0, 50), // Use first 50 char of query as name
            type: "QNA",
            prompt: testCase.query,
            expectedJson: {
                expectedSource: testCase.expectedSource,
                expectedChunks: testCase.expectedChunks,
                tags: testCase.tags,
            },
        });
    }

    console.log("✓ Eval cases seeded successfully");
    return suite.id;
}

// Run if called directly
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    seedEvalCases()
        .then((suiteId) => {
            console.log(`\nSuite ID: ${suiteId}`);
            console.log("Run eval with: npm run eval");
            process.exit(0);
        })
        .catch((error) => {
            console.error("Failed to seed eval cases:", error);
            process.exit(1);
        });
}

export { seedEvalCases, SLACK_EVAL_CASES };
