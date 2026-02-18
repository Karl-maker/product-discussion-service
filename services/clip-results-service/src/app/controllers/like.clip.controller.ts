import type { RequestContext } from "../../handler/api-gateway/types";
import { LikeClipUseCase } from "../usecases/like.clip.usecase";

export class LikeClipController {
  constructor(private readonly useCase: LikeClipUseCase) {}

  handle = async (req: RequestContext) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId : "";
    const clipId = typeof body.clipId === "string" ? body.clipId : "";
    if (!userId || !clipId) {
      const err = new Error("userId and clipId are required");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    return this.useCase.execute(userId, clipId);
  };
}
