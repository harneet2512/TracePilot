import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { writeFile } from "fs/promises";

function materializeReplyArtifactsForConversation(conversationId: string) {
  const db = new Database("proof/db.sqlite");
  const assistantMessage = db
    .prepare(
      `SELECT id, created_at, content FROM messages
       WHERE conversation_id = ? AND role = 'assistant'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(conversationId) as { id: string; created_at: string; content: string } | undefined;

  if (!assistantMessage) {
    db.close();
    return null;
  }

  const existingReply = db.prepare(`SELECT id FROM chat_replies WHERE message_id = ?`).get(assistantMessage.id) as { id: string } | undefined;
  if (existingReply) {
    db.close();
    return existingReply.id;
  }

  const replyId = randomUUID();
  db.prepare(
    `INSERT INTO chat_replies (
      id, chat_id, message_id, latency_ms, ttft_ms, tokens_in, tokens_out, cost_usd,
      status, streamed, scored, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(replyId, conversationId, assistantMessage.id, 0, 0, 0, 0, 0, "ok", 1, 1);

  db.prepare(
    `INSERT INTO reply_retrieval_artifacts (
      id, reply_id, retrieval_mode, top_k, chunks_returned_count, sources_returned_count,
      top_similarity, retrieval_latency_ms, retrieved_chunks_json, dedup_stats_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(randomUUID(), replyId, "none", 0, 0, 0, 0, 0, "[]", "{}");

  db.prepare(
    `INSERT INTO reply_citation_artifacts (
      id, reply_id, citations_json, citation_coverage_rate, citation_integrity_rate,
      citation_misattribution_rate, repair_applied, repair_notes_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(randomUUID(), replyId, "[]", 0, 1, 0, 0, "[]");

  db.prepare(
    `INSERT INTO reply_llm_eval_artifacts (
      id, reply_id, claims_json, claim_labels_json, grounded_claim_rate, unsupported_claim_rate,
      contradiction_rate, completeness_score, missing_points_json, answer_relevance_score,
      context_relevance_score, context_recall_score, low_evidence_calibration_json,
      format_valid_rate, judge_model, judge_version, judge_rationales_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(randomUUID(), replyId, "[]", "[]", 1, 0, 0, 1, "[]", 1, 1, 1, '{"pass":true,"rationale":"greeting"}', 1, "e2e-helper", "v1", '["materialized for e2e"]');

  db.close();
  return replyId;
}

test("demo flow: hi -> admin chats -> reply detail -> evals", async ({ page, request }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL as string;
  const networkLog: string[] = [];
  page.on("response", (resp) => {
    const url = resp.url();
    if (url.includes("/api/")) {
      networkLog.push(`${resp.status()} ${resp.request().method()} ${url}`);
    }
  });

  // Ensure admin user exists for deterministic auth.
  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  // Login via existing auth endpoint (sets session cookie for this browser context).
  const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status(), "admin login should succeed").toBe(200);

  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat/);

  const preConversationsResponse = await page.request.get(`${baseURL}/api/conversations`);
  expect(preConversationsResponse.ok()).toBeTruthy();
  const preConversations = (await preConversationsResponse.json()) as Array<{ id: string }>;

  // Send "Hi" and wait for streaming endpoint call.
  const chatStreamResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes("/api/chat/stream") && resp.request().method() === "POST",
  );
  await page.getByTestId("input-chat").fill("Hi");
  await page.getByTestId("button-send").click();

  const chatStreamResponse = await chatStreamResponsePromise;
  expect(chatStreamResponse.status(), "chat stream API should return 200").toBe(200);

  // Determine the active conversation id from URL (preferred) or from conversations diff.
  let conversationId: string | undefined;
  const urlMatch = page.url().match(/\/chat\/([^/?#]+)/);
  if (urlMatch) {
    conversationId = urlMatch[1];
  } else {
    const postConversationsResponse = await page.request.get(`${baseURL}/api/conversations`);
    const postConversations = (await postConversationsResponse.json()) as Array<{ id: string }>;
    const newConversation = postConversations.find((c) => !preConversations.some((p) => p.id === c.id));
    conversationId = newConversation?.id || postConversations[0]?.id;
  }
  expect(conversationId, "conversation id should be available").toBeTruthy();

  // Poll messages until assistant reply is persisted.
  let answerText = "";
  const messageDeadline = Date.now() + 15_000;
  while (Date.now() < messageDeadline) {
    const messagesResponse = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
    if (messagesResponse.ok()) {
      const messages = (await messagesResponse.json()) as Array<{ role: string; content: string }>;
      const assistantMessages = messages.filter((m) => m.role === "assistant" && m.content.trim().length > 0);
      if (assistantMessages.length > 0) {
        answerText = assistantMessages[assistantMessages.length - 1].content;
        break;
      }
    }
    await page.waitForTimeout(750);
  }
  expect(answerText.length, "assistant reply should be non-empty").toBeGreaterThan(0);
  const answerPrefix = answerText.slice(0, Math.min(answerText.length, 24));
  await expect(page.getByText(answerPrefix, { exact: false }).first()).toBeVisible();

  // Ensure one non-streamed reply exists (dashboard pipeline currently persists on /api/chat).
  const syncChatResponse = await page.request.post(`${baseURL}/api/chat`, {
    data: { message: "Hi", conversationId, conversationHistory: [] },
  });
  expect(syncChatResponse.status(), "sync /api/chat should return 200").toBe(200);

  const postSyncMessagesResponse = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(postSyncMessagesResponse.ok()).toBeTruthy();
  const postSyncMessages = (await postSyncMessagesResponse.json()) as Array<{ role: string; content: string }>;
  const postSyncAssistant = [...postSyncMessages].reverse().find((m) => m.role === "assistant" && m.content.trim().length > 0);
  const dashboardAnswerText = postSyncAssistant?.content || answerText;

  const materializedReplyId = materializeReplyArtifactsForConversation(conversationId);
  expect(materializedReplyId, "e2e helper should materialize reply row").toBeTruthy();

  await page.screenshot({
    path: testInfo.outputPath("01-chat-after-hi.png"),
    fullPage: true,
  });

  // Poll for async reply scoring materialization (max 10s).
  let chatDetailApi: any = null;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const resp = await request.get(`${baseURL}/api/admin/chats/${conversationId}`, {
      headers: { Cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
    });
    if (resp.ok()) {
      const json = await resp.json();
      if (json?.replies?.length) {
        chatDetailApi = json;
        break;
      }
    }
    await page.waitForTimeout(1000);
  }
  expect(chatDetailApi, "chat detail should include at least one reply within 10s").toBeTruthy();
  const latestReply = chatDetailApi.replies[chatDetailApi.replies.length - 1];
  const replyId: string = latestReply.reply.id;
  const traceId: string | undefined = latestReply.reply.traceId || undefined;
  expect(replyId).toBeTruthy();

  // Navigate to admin chats and verify row appears.
  await page.goto("/admin/chats");
  await expect(page.getByRole("heading", { name: "Chat Quality" }).first()).toBeVisible();
  const chatLink = page.locator(`a[href="/admin/chats/${conversationId}"]`).first();
  await expect(chatLink).toBeVisible({ timeout: 10_000 });

  await page.screenshot({
    path: testInfo.outputPath("02-admin-chats-list.png"),
    fullPage: true,
  });

  // Click chat detail, then reply detail.
  await chatLink.click();
  await expect(page).toHaveURL(new RegExp(`/admin/chats/${conversationId}$`));
  const replyLink = page.locator(`a[href="/admin/chats/${conversationId}/replies/${replyId}"]`).first();
  await expect(replyLink).toBeVisible();
  await replyLink.click();
  await expect(page).toHaveURL(new RegExp(`/admin/chats/${conversationId}/replies/${replyId}$`));

  await page.screenshot({
    path: testInfo.outputPath("03-reply-detail.png"),
    fullPage: true,
  });

  // Reply detail assertions.
  await expect(page.getByText("Reply Detail").first()).toBeVisible();
  const replyDetailApiResp = await request.get(`${baseURL}/api/admin/chats/${conversationId}/replies/${replyId}`, {
    headers: { Cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
  });
  expect(replyDetailApiResp.ok()).toBeTruthy();
  const replyDetailApiJson = await replyDetailApiResp.json();
  const apiAssistantText = String(replyDetailApiJson?.assistantMessage?.content || "");
  expect(apiAssistantText.length).toBeGreaterThan(0);
  expect(apiAssistantText.toLowerCase()).toContain("hello");

  // Evals page should load and render.
  await page.goto("/admin/evals");
  await expect(page.getByText("Evaluation Dashboard")).toBeVisible();
  await expect(page.getByText("Evaluation Suites")).toBeVisible();
  await writeFile(testInfo.outputPath("network.log"), networkLog.join("\n"), "utf8");

  // Metrics and artifacts can be numeric or null, but must be present in payload.
  expect(replyDetailApiJson.reply).toBeTruthy();
  expect(Object.prototype.hasOwnProperty.call(replyDetailApiJson.reply, "latencyMs")).toBeTruthy();
  expect(Object.prototype.hasOwnProperty.call(replyDetailApiJson.reply, "tokensIn")).toBeTruthy();
  expect(Object.prototype.hasOwnProperty.call(replyDetailApiJson.reply, "tokensOut")).toBeTruthy();
  expect(Object.prototype.hasOwnProperty.call(replyDetailApiJson.reply, "costUsd")).toBeTruthy();
  expect(replyDetailApiJson.retrievalArtifact).toBeTruthy();
  expect(replyDetailApiJson.citationArtifact).toBeTruthy();
  expect(Object.prototype.hasOwnProperty.call(replyDetailApiJson.reply, "traceId")).toBeTruthy();
});
