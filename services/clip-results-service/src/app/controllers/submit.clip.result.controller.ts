import type { RequestContext } from "../../handler/api-gateway/types";
import { SubmitClipResultUseCase } from "../usecases/submit.clip.result.usecase";

export class SubmitClipResultController {
  constructor(private readonly useCase: SubmitClipResultUseCase) {}

  handle = async (req: RequestContext) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId : "";
    const clipId = typeof body.clipId === "string" ? body.clipId : "";
    const score = typeof body.score === "number" ? body.score : Number(body.score);
    const attemptedAt = typeof body.attemptedAt === "string" ? body.attemptedAt : undefined;
    if (!userId || !clipId) {
      const err = new Error("userId and clipId are required");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    if (Number.isNaN(score) || score < 0 || score > 1) {
      const err = new Error("score must be a number between 0 and 1");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    return this.useCase.execute({ userId, clipId, score, attemptedAt });
  };
}
