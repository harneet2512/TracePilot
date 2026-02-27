import type { Job } from "@shared/schema";
import { registerJobHandler } from "../runner";
import { scoreReplyWithJudge } from "../../scoring/replyScoringPipeline";

interface ScoreReplyPayload {
  replyId: string;
  userPromptForJudge?: string;
}

registerJobHandler("score_reply", async (job: Job) => {
  try {
    const payload = (job.inputJson ?? {}) as ScoreReplyPayload;
    if (!payload.replyId) {
      return { success: false, error: "Missing replyId", errorCode: "400" };
    }

    await scoreReplyWithJudge(payload.replyId, payload.userPromptForJudge);
    return { success: true, output: { replyId: payload.replyId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message, errorCode: "500" };
  }
});
