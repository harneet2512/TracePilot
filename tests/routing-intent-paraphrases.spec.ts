import { test, expect } from "@playwright/test";
import { runCitationQuery } from "./helpers/citationIntegrity";

const ownerDeadlineParaphrases = [
  "Who is responsible for the current launch blocker and what is the due date?",
  "Can you tell me the owner and ETA for the blocker?",
  "Which person owns this issue, and when is it due?",
  "I need assignee plus deadline for the blocker status update.",
  "Who owns this risk item and what's the target date?",
];

const blockerParaphrases = [
  "What blockers are most likely to delay launch?",
  "List the highest risks and how we are mitigating them.",
  "What issues are blocking launch readiness right now?",
  "Give me top blocker impacts and mitigation actions.",
  "Which risks are active and what is the response plan?",
];

const roadmapParaphrases = [
  "Show roadmap milestones for upcoming releases.",
  "What does our timeline look like for next phases?",
  "Give me the release schedule and key milestones.",
];

for (const query of ownerDeadlineParaphrases) {
  test(`routing owner/deadline paraphrase: ${query}`, async ({ page, request }, testInfo) => {
    const { response } = await runCitationQuery({ page, request, testInfo, query });
    const citations = Array.isArray(response?.citations) ? response.citations : [];
    const answer = String(response?.answer_text || response?.answer || "").toLowerCase();
    const evidence = Array.isArray(response?.details?.evidenceBySource) ? response.details.evidenceBySource : [];
    expect(answer.length).toBeGreaterThan(0);
    expect(citations.length > 0 || evidence.length === 0).toBe(true);
  });
}

for (const query of blockerParaphrases) {
  test(`routing blockers paraphrase: ${query}`, async ({ page, request }, testInfo) => {
    const { response } = await runCitationQuery({ page, request, testInfo, query });
    const citations = Array.isArray(response?.citations) ? response.citations : [];
    const answer = String(response?.answer_text || response?.answer || "").toLowerCase();
    const evidence = Array.isArray(response?.details?.evidenceBySource) ? response.details.evidenceBySource : [];
    expect(answer.length).toBeGreaterThan(0);
    expect(citations.length > 0 || evidence.length === 0).toBe(true);
  });
}

for (const query of roadmapParaphrases) {
  test(`routing roadmap paraphrase: ${query}`, async ({ page, request }, testInfo) => {
    const { response } = await runCitationQuery({ page, request, testInfo, query });
    const citations = Array.isArray(response?.citations) ? response.citations : [];
    const answer = String(response?.answer_text || response?.answer || "").toLowerCase();
    const evidence = Array.isArray(response?.details?.evidenceBySource) ? response.details.evidenceBySource : [];
    expect(answer.length).toBeGreaterThan(0);
    expect(citations.length > 0 || evidence.length === 0).toBe(true);
  });
}

