import type { RequestContext } from "../../handler/api-gateway/types";
import { UnlikeClipUseCase } from "../usecases/unlike.clip.usecase";

export class UnlikeClipController {
  constructor(private readonly useCase: UnlikeClipUseCase) {}

  handle = async (req: RequestContext) => {
    const userId = req.query?.userId ?? req.query?.user_id;
    const clipId = req.query?.clipId ?? req.query?.clip_id;
    if (!userId || typeof userId !== "string" || !clipId || typeof clipId !== "string") {
      const err = new Error("Query parameters userId and clipId are required");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    return this.useCase.execute(userId, clipId);
  };
}
