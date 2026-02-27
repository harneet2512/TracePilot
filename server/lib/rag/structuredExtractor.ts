
import { chatCompletion, ChatMessage } from "../openai";

export type IntentType = "OKR" | "ROADMAP" | "BLOCKER" | "OWNER" | "DEADLINE" | "BUDGET" | "ARCHITECTURE" | "SMALLTALK" | "GENERAL";

export interface OKRItem {
    objective: string;
    owner?: string;
    keyResults: Array<{
        result: string;
        target?: string;
        current?: string;
        owner?: string;
        status?: string;
        due?: string;
        citations: Array<{ chunkId: string; quote: string }>;
    }>;
    timeframe?: string;
}

export interface RoadmapItem {
    milestone: string;
    date?: string;
    status?: string;
    details?: string;
}

export interface ExtractedData {
    type: IntentType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
}

export function detectIntent(query: string): IntentType {
    const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
    const normalizedNoPunct = normalized.replace(/[?!.,;:]+/g, "").trim();
    if (!normalized) return "SMALLTALK";

    // Smalltalk/greeting: check BEFORE doc intents so "hi" never triggers retrieval
    const greetings = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|bye|goodbye|good morning|good afternoon|good evening)[\s!.?]*$/i;
    const smalltalkHelp = /^(help(?: me)?|what are you|who are you|how do you work|how do i use (?:this|it)|what can you do|what do you do|what you do|what can u do|what do u do|what u do)[\s!.?]*$/i;
    const docSignals = /\b(file|files|doc|docs|document|documents|okr|project|task|report|meeting|slack|jira|confluence|drive|search|find|show|roadmap|blocker|risk|deadline|budget|owner|status|source|citation|contact|team|infrastructure|architecture|responsible|assigned|database|vector|technology|system|service|api|tool|stack|using|backend|frontend|library|framework|language|platform|version|model|index|embedding|chunk|retrieval|latency|performance|cost|price|launch|deploy|integration|connector|sync|pipeline|query|endpoint|schema|config|claude|gpt|openai|anthropic|llm|chose|choose|chosen|versus|compare|phoenix|onboard)\b/i;
    if (greetings.test(normalized) || smalltalkHelp.test(normalized)) return "SMALLTALK";
    if (normalized.length <= 40 && !docSignals.test(normalizedNoPunct)) {
        return "SMALLTALK";
    }
    if (
        /\b(what|how|who)\b/.test(normalizedNoPunct) &&
        /\b(you|u|assistant|this|it)\b/.test(normalizedNoPunct) &&
        !docSignals.test(normalizedNoPunct)
    ) {
        return "SMALLTALK";
    }
    // Comprehensive overview queries (new hire onboarding, full overview) → GENERAL
    // These multi-topic queries need the full streaming path, not a single structured extractor.
    if (normalized.includes("comprehensive") && normalized.length > 100) {
        return "GENERAL";
    }

    const score: Record<Exclude<IntentType, "SMALLTALK" | "GENERAL">, number> = {
        OKR: 0,
        ROADMAP: 0,
        BLOCKER: 0,
        OWNER: 0,
        DEADLINE: 0,
        BUDGET: 0,
        ARCHITECTURE: 0,
    };

    const addScore = (intent: keyof typeof score, points: number, re: RegExp) => {
        if (re.test(normalized)) score[intent] += points;
    };

    addScore("OKR", 2, /\b(okrs?|objectives?|key results?|goals?|kpis?|metrics?)\b/);
    addScore("ROADMAP", 2, /\b(roadmaps?|milestones?|timelines?|releases?|phases?|launch date)\b/);
    addScore("BLOCKER", 2, /\b(blockers?|issues?|problems?|risks?|obstacles?|impediments?)\b/);
    addScore("OWNER", 2, /\b(owners?|responsible|assignees?|contacts?|leads?)\b/);
    addScore("DEADLINE", 2, /\b(deadlines?|date|timing|due|eta|by when)\b/);
    addScore("BUDGET", 2, /\b(costs?|budgets?|prices?|spend|expenses?|funds?|financial)\b/);
    addScore("ARCHITECTURE", 2, /\b(architecture|design\s*doc|system\s*design|vector\s*database|tech\s*stack|infrastructure\s*design|embedding|pipeline)\b/);
    addScore("ARCHITECTURE", 2, /\b(chose|choose|chosen|picked|selected|vs\.?|versus|compared?)\b/);

    // Question-word affinity helps with mixed-intent prompts.
    if (/\bwho\b/.test(normalizedNoPunct)) score.OWNER += 3;
    if (/\bwhen\b/.test(normalizedNoPunct)) score.DEADLINE += 3;
    if (/\bwhat\b/.test(normalizedNoPunct) && /\b(blockers?|risks?)\b/.test(normalizedNoPunct)) score.BLOCKER += 1;

    // Compound owner+deadline: "who is responsible... and when is the deadline?" → OWNER
    // even if a blocker is mentioned as context, the primary ask is about ownership+deadline.
    if (score.OWNER >= 2 && score.DEADLINE >= 2) {
        return "OWNER";
    }

    // Blocker/risk queries with owner/deadline asks where BLOCKER dominates.
    if (score.BLOCKER >= 2 && score.BLOCKER > score.OWNER && score.BLOCKER > score.DEADLINE) {
        return "BLOCKER";
    }

    const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
    const [bestIntent, bestScore] = ranked[0] as [IntentType, number];
    if (!bestScore || bestScore <= 0) return "GENERAL";

    // Tie-breaker order favors intents with richer structured extraction for enterprise queries.
    const tieOrder: IntentType[] = ["OWNER", "DEADLINE", "BLOCKER", "ARCHITECTURE", "ROADMAP", "OKR", "BUDGET"];
    const tied = ranked.filter(([, s]) => s === bestScore).map(([intent]) => intent as IntentType);
    if (tied.length > 1) {
        const tieWinner = tieOrder.find((intent) => tied.includes(intent));
        return tieWinner || bestIntent;
    }
    return bestIntent;
}

const OKR_JSON_SCHEMA = {
    type: "object",
    properties: {
        framingContext: {
            type: "string",
            description: "Write EXACTLY 2-4 sentences as an executive narrative that directly answers the query. CRITICAL: Do NOT start with 'Here are', 'Based on', 'I found', or any list-opener. Start with a direct declarative statement naming the project/scope with 1-2 key data points (status, count, owner, target, date). End with a question about priorities or at-risk items. Example: 'Project X has N objectives for [TIMEFRAME], with M on track and K at risk. The primary target is [METRIC] by [DATE], currently at [CURRENT]. Would you like to focus on the at-risk items or deadline breakdown?'"
        },
        summary: {
            type: "string",
            description: "Executive summary with 2-4 key facts separated by ' • '. Use compact notation: dates (Nov 15), metrics (2s p95), money ($180K), status (At Risk). Example: '[DATE] launch • [METRIC] target • [AMOUNT] budget • N items at risk'"
        },
        items: {
            type: "array",
            description: "Extract ALL objectives from the document and their key results. Include EVERY objective — primary launch objectives AND cost/budget/infrastructure objectives. Never omit objectives.",
            items: {
                type: "object",
                properties: {
                    objective: { type: "string", description: "The objective statement" },
                    owner: { type: "string", description: "Owner of the Objective if stated" },
                    timeframe: { type: "string", description: "Quarter or timeframe" },
                    citations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                chunkId: { type: "string" },
                                quote: { type: "string" }
                            },
                            required: ["chunkId", "quote"],
                            additionalProperties: false
                        }
                    },
                    keyResults: {
                        type: "array",
                        description: "List of key results associated with this objective",
                        items: {
                            type: "object",
                            properties: {
                                result: { type: "string", description: "The key result statement" },
                                target: { type: ["string", "null"], description: "Target metric value if explicitly stated (e.g., '5.2s p95', '$1M'). ONLY include if in source text." },
                                current: { type: ["string", "null"], description: "Current metric value if explicitly stated (e.g., '5.5s', '$800k'). ONLY include if in source text." },
                                owner: { type: ["string", "null"], description: "Owner of the KR if explicitly stated. ONLY include if in source text." },
                                status: { type: ["string", "null"], description: "Status ONLY if explicitly stated in source text. Use EXACT wording ('At Risk', 'On Track', 'Behind Schedule'). DO NOT infer from current vs target." },
                                due: { type: ["string", "null"], description: "Due date if explicitly stated. ONLY include if in source text." },
                                citations: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            chunkId: { type: "string" },
                                            quote: { type: "string" }
                                        },
                                        required: ["chunkId", "quote"],
                                        additionalProperties: false
                                    }
                                }
                            },
                            required: ["result", "target", "current", "owner", "status", "due", "citations"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["objective", "owner", "timeframe", "keyResults", "citations"],
                additionalProperties: false
            }
        }
    },
    required: ["items", "framingContext", "summary"],
    additionalProperties: false
};

const ROADMAP_JSON_SCHEMA = {
    type: "object",
    properties: {
        framingContext: {
            type: "string",
            description: "Write EXACTLY 2-4 sentences as an executive narrative. Cover all time periods found in the document concisely. Do NOT start with 'Here are', 'Based on', 'I found', or any filler opener. MUST end with a follow-up question. Example: 'The [YEAR] roadmap spans N phases from [PERIOD] through [PERIOD], covering [THEME]. Key milestones include [FEATURE] in [PERIOD] and [FEATURE] in [PERIOD]. Would you like details on a specific phase?'"
        },
        summary: {
            type: "string",
            description: "Executive summary with 2-4 key milestones separated by ' • '. Use compact notation: dates (Q1 2025), features (search v2), status (launched). Example: 'Q1 launch • Search v2 • Mobile app beta • API v3'"
        },
        items: {
            type: "array",
            description: "Extract ALL milestones from ALL time periods found in the document. REQUIRED: Include at least one item from EACH period that appears in the context. Use the date field to label the period.",
            items: {
                type: "object",
                properties: {
                    milestone: { type: "string", description: "Name of the milestone or feature" },
                    date: { type: "string", description: "REQUIRED time period label (e.g., 'Q1 2025', 'H2 2025', 'Phase 1'). Every item MUST have a period label." },
                    status: { type: "string", description: "Current status if mentioned" },
                    details: { type: "string", description: "Additional details" },
                    citations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                chunkId: { type: "string" },
                                quote: { type: "string" }
                            },
                            required: ["chunkId", "quote"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["milestone", "date", "status", "details", "citations"],
                additionalProperties: false
            }
        }
    },
    required: ["items", "framingContext", "summary"],
    additionalProperties: false
};

const BLOCKER_JSON_SCHEMA = {
    type: "object",
    properties: {
        framingContext: {
            type: "string",
            description: "Write EXACTLY 2-4 sentences as an executive narrative that directly answers the query. CRITICAL: Do NOT start with 'Here are', 'Based on', 'I found', 'Retrieved', 'The following', or any list-opener. Start with a direct statement: name the project, state the blocker count and the most critical one. End the last sentence with a question about the most urgent next step. Example: 'The AI Search project has 2 active blockers ahead of the Nov 15 launch. The AWS EU region quota delay is the most critical risk, escalated to the AWS VP with a Nov 11 resolution target. Jordan Martinez is leading the remediation effort. Would you like details on the mitigation plan or deadline risks?'"
        },
        summary: {
            type: "string",
            description: "Executive summary with 2-4 key blockers separated by ' • '. Use compact notation: brief issue description with status. Example: 'AWS EU delays (critical, Nov 11) • Pinecone 15% over budget • Drive rate limits'"
        },
        items: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    blocker: { type: "string", description: "The blocker or issue description" },
                    impact: { type: "string", description: "Business or technical impact" },
                    status: { type: "string", description: "Current status — CRITICAL, HIGH, MEDIUM, or LOW based on source text" },
                    deadline: { type: "string", description: "Expected resolution date if stated in source (e.g., 'Nov 11, 2024'). Leave empty string if not mentioned." },
                    citations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                chunkId: { type: "string" },
                                quote: { type: "string" }
                            },
                            required: ["chunkId", "quote"],
                            additionalProperties: false
                        }
                    },
                    owner: { type: "string", description: "FULL NAME (first + last) of person working on it. Extract from source text verbatim. Example: 'Jordan Martinez' not 'Jordan'." }
                },
                required: ["blocker", "impact", "status", "owner", "deadline", "citations"],
                additionalProperties: false
            }
        }
    },
    required: ["items", "framingContext", "summary"],
    additionalProperties: false
};

const OWNER_JSON_SCHEMA = {
    type: "object",
    properties: {
        framingContext: {
            type: "string",
            description: "Write a 2-4 sentence executive narrative paragraph that directly answers the query. Start with the most important finding; name the key owners and their primary responsibilities. Do NOT start with 'Here are', 'Based on', 'I found', or any filler opener. Example: 'Jordan Martinez leads infrastructure for the AI Search project, with a Nov 15 deadline for the semantic search launch. Sam Chen owns backend services and Alex Kim is responsible for the frontend integration. Two ownership items are unassigned pending the Q4 reorg.'"
        },
        summary: {
            type: "string",
            description: "Executive summary with 2-4 key owners separated by ' • '. Use compact format: person name with responsibility. Example: 'Jordan Martinez (infra) • Sam Chen (backend) • Alex Kim (frontend)'"
        },
        items: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    responsibility: { type: "string", description: "The task or area of responsibility" },
                    person: { type: "string", description: "Name of person or team responsible" },
                    contact: { type: "string", description: "Contact info if available" },
                    deadline: { type: "string", description: "Deadline/ETA if explicitly present in source text" },
                    citations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                chunkId: { type: "string" },
                                quote: { type: "string" }
                            },
                            required: ["chunkId", "quote"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["responsibility", "person", "contact", "deadline", "citations"],
                additionalProperties: false
            }
        }
    },
    required: ["items", "framingContext", "summary"],
    additionalProperties: false
};

const DEADLINE_JSON_SCHEMA = {
    type: "object",
    properties: {
        framingContext: {
            type: "string",
            description: "Write a 2-4 sentence executive narrative paragraph that directly answers the query. Start with the most important finding; name the soonest deadline and any at-risk items. Do NOT start with 'Here are', 'Based on', 'I found', or any filler opener. Example: 'The AI Search project has 4 Q4 deadlines, with the earliest being Nov 15 for the semantic search launch. The Dec 1 beta cutoff is currently At Risk due to infrastructure delays. All remaining deadlines fall within Q1 2025.'"
        },
        summary: {
            type: "string",
            description: "Executive summary with 2-4 key deadlines separated by ' • '. Use compact format: date with task. Example: 'Nov 15 launch • Dec 1 beta • Dec 15 migration • Q1 2025 v2.0'"
        },
        items: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    task: { type: "string", description: "The task or milestone" },
                    deadline: { type: "string", description: "The deadline date" },
                    status: { type: "string", description: "Current status" },
                    citations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                chunkId: { type: "string" },
                                quote: { type: "string" }
                            },
                            required: ["chunkId", "quote"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["task", "deadline", "status", "citations"],
                additionalProperties: false
            }
        }
    },
    required: ["items", "framingContext", "summary"],
    additionalProperties: false
};

const BUDGET_JSON_SCHEMA = {
    type: "object",
    properties: {
        framingContext: {
            type: "string",
            description: "Write a 2-4 sentence executive narrative paragraph that directly answers the query. Start with the most important finding; state the total budget, largest line items, and any overruns. Use EXACT comma-formatted dollar amounts (e.g., $1,000,000 not $1M). Do NOT start with 'Here are', 'Based on', 'I found', or any filler opener. Example: 'The total budget is [AMOUNT] across N categories. [CATEGORY] accounts for [AMOUNT], the largest allocation. [CATEGORY] ([AMOUNT]) and [CATEGORY] ([AMOUNT]) are on track.'"
        },
        summary: {
            type: "string",
            description: "Executive summary with 2-4 key budget items separated by ' • '. Use EXACT comma-formatted amounts. DO NOT abbreviate to K/M notation. Example: '[AMOUNT] [CATEGORY] • [AMOUNT] [CATEGORY] • [AMOUNT] total'"
        },
        items: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    category: { type: "string", description: "Cost category or item" },
                    amount: { type: "string", description: "The monetary amount — MUST use exact comma notation ($180,000 not $180K, $2,565,000 not $2.565M). Copy exactly from source." },
                    details: { type: "string", description: "Additional context" },
                    citations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                chunkId: { type: "string" },
                                quote: { type: "string" }
                            },
                            required: ["chunkId", "quote"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["category", "amount", "details", "citations"],
                additionalProperties: false
            }
        }
    },
    required: ["items", "framingContext", "summary"],
    additionalProperties: false
};

const ARCHITECTURE_JSON_SCHEMA = {
    type: "object",
    properties: {
        framingContext: {
            type: "string",
            description: "Write EXACTLY 2-4 sentences as an executive narrative. State the core technology decision and rationale. Do NOT start with 'Here are', 'Based on', 'I found'. End with a follow-up question. Example: '[SYSTEM] uses [TECHNOLOGY] for [REASON]. The decision was driven by [TRADEOFF]. Would you like to explore [ASPECT] further?'"
        },
        summary: {
            type: "string",
            description: "Executive summary with 2-4 key technical facts separated by ' • '. Example: '[TECH] selected • [CONFIG] setup • [METRIC] performance • [COST] monthly'"
        },
        items: {
            type: "array",
            description: "Extract ALL technical decisions, components, and configurations from the document.",
            items: {
                type: "object",
                properties: {
                    component: { type: "string", description: "Technology component or decision" },
                    details: { type: "string", description: "Configuration, rationale, or specification" },
                    cost: { type: ["string", "null"], description: "Cost if mentioned" },
                    rationale: { type: ["string", "null"], description: "Why this choice was made" },
                    citations: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                chunkId: { type: "string" },
                                quote: { type: "string" }
                            },
                            required: ["chunkId", "quote"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["component", "details", "citations"],
                additionalProperties: false
            }
        }
    },
    required: ["items", "framingContext", "summary"],
    additionalProperties: false
};

const FACTS_JSON_SCHEMA = {
    type: "object",
    properties: {
        facts: {
            type: "array",
            items: { type: "string", description: "Extracted fact" }
        }
    },
    required: ["facts"],
    additionalProperties: false
};

export async function runStructuredExtractor(
    query: string,
    context: string,
    intent: IntentType,
    retryStrict: boolean = false
): Promise<ExtractedData> {
    let systemPrompt = `You are a strict data extraction assistant.
Context provided below.
Extract ONLY the information requested by the format.
If specific information is not found (e.g. no KRs, no date), use an empty string or empty list as appropriate, do NOT make things up.
DO NOT hallucinate.
DO NOT paraphrase key terms. Use exact wording from the source where possible.
IMPORTANT: For every item, you MUST provide 'citations'. Each citation must include the exact 'chunkId' from the source header and the exact 'quote' (substring) from the text that supports the extraction.

RESPONSE FORMAT REQUIREMENTS:
1. framingContext: Write a 2-4 sentence executive narrative paragraph that directly answers the query.
   - Start with the most important finding, naming the project/scope
   - Incorporate 1-2 key data points (status, count, owner, target, date) from the context
   - Do NOT begin with "Here are", "Based on", "I found", "Sure!", or any filler opener
   - Example: "Project X has N objectives led by [OWNER]. The primary target of [METRIC] is [STATUS] with current baseline at [CURRENT]."

2. summary: Create an executive summary with 2-4 key facts separated by ' • '
   - Use agent-style COMPACT notation:
     * Dates: "Nov 15" not "November 15, 2024"
     * Metrics: "2s p95" not "2 seconds 95th percentile"
     * Money: "$180K" or "$2.565M" not spelled out
     * Status indicators: "At Risk", "On Track", "Behind"
   - Prioritize: dates, monetary values, key metrics, critical status
   - Example: "[DATE] launch • [METRIC] target • [AMOUNT] budget • N items at risk"

3. items: Full structured data with all fields and citations

LANGUAGE STYLE:
- Use inline metadata: "Owner: [NAME]" not separate lines
- Compact sentences: "Achieve [METRIC] (current [VALUE], owner: [NAME])"
- NEVER use em dashes or en dashes. Use commas, periods, or parentheses instead.
- Avoid repetitive labels and padding

CRITICAL GROUNDING RULES:
1. STATUS FIELD: ONLY include if explicitly stated in source text
   - Use EXACT wording ("At Risk", "On Track", "Behind Schedule")
   - DO NOT infer status from current vs target comparison
   - If status not mentioned, leave field null or omit it

2. METADATA FIELDS (owner, target, current, due): ONLY include if explicitly in source
   - Do NOT make up owners, targets, dates if not present
   - Leave as null if not found

3. CITATIONS: Every claim must include exact quote from source chunk
   - Quote must be verbatim substring of chunk text
   - No paraphrasing in quotes

4. BLOCKERS/ROADMAP: Do NOT include unless query explicitly asks for them
   - If included, they must be cited with exact quotes`;

    if (retryStrict) {
        systemPrompt += `\n\nCRITICAL WARNING: Your previous attempt was rejected because the 'quote' fields did not EXACTLY match the source text substring. 
        You MUST copy the quote EXACTLY as it appears in the text, including whitespace, punctuation, and abbreviations (e.g. use "Nov 15" not "November 15"). 
        DO NOT EXPAND abbreviations. DO NOT CORRECT types. COPY EXACTLY.`;
    }

    let schema;
    let schemaName;

    if (intent === "OKR") {
        schema = OKR_JSON_SCHEMA;
        schemaName = "extract_okrs";
    } else if (intent === "ROADMAP") {
        schema = ROADMAP_JSON_SCHEMA;
        schemaName = "extract_roadmap";
    } else if (intent === "BLOCKER") {
        schema = BLOCKER_JSON_SCHEMA;
        schemaName = "extract_blockers";
    } else if (intent === "OWNER") {
        schema = OWNER_JSON_SCHEMA;
        schemaName = "extract_owners";
    } else if (intent === "DEADLINE") {
        schema = DEADLINE_JSON_SCHEMA;
        schemaName = "extract_deadlines";
    } else if (intent === "ARCHITECTURE") {
        schema = ARCHITECTURE_JSON_SCHEMA;
        schemaName = "extract_architecture";
    } else if (intent === "BUDGET") {
        schema = BUDGET_JSON_SCHEMA;
        schemaName = "extract_budget";
        // CRITICAL: For budget queries, always use exact comma notation.
        // The general system prompt uses "$180K" compact notation which loses precision.
        // NOTE: This must be appended BEFORE messages are created below.
        systemPrompt += `\n\nBUDGET EXTRACTION CRITICAL RULES:
- Use EXACT dollar amounts with comma separators as they appear in the source: $2,565,000 not $2.565M, $180,000 not $180K
- Copy the amount EXACTLY as written in the source document
- DO NOT round, abbreviate, or convert to millions/thousands notation
- Example: if source says "$2,565,000", output "$2,565,000" — NOT "$2.565M"`;
    } else {
        schema = FACTS_JSON_SCHEMA;
        schemaName = "extract_facts";
    }

    const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Context:\n${context}\n\nQuery: ${query}` }
    ];

    try {
        const response = await chatCompletion(messages, {
            temperature: 0,
            jsonSchema: schema
        });

        const parsed = JSON.parse(response);
        return { type: intent, data: parsed };
    } catch (e: any) {
        console.error(`[structuredExtractor] ${intent} extraction failed:`, e);
        return { type: intent, data: { items: [], facts: [] } };
    }
}

// Export schemas for testing
export {
    OKR_JSON_SCHEMA,
    ROADMAP_JSON_SCHEMA,
    BLOCKER_JSON_SCHEMA,
    OWNER_JSON_SCHEMA,
    DEADLINE_JSON_SCHEMA,
    BUDGET_JSON_SCHEMA,
    ARCHITECTURE_JSON_SCHEMA
};
