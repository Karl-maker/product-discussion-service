import type { RequestContext } from "../../handler/api-gateway/types";
import { CheckLikeUseCase } from "../usecases/check.like.usecase";

export class CheckLikeController {
  constructor(private readonly useCase: CheckLikeUseCase) {}

  handle = async (req: RequestContext) => {
    const userId = req.query?.userId ?? req.query?.user_id;
    const clipId = req.query?.clipId ?? req.query?.clip_id;
    if (!userId || typeof userId !== "string" || !clipId || typeof clipId !== "string") {
      const err = new Error("Query parameters userId and clipId are required");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    const like = await this.useCase.execute(userId, clipId);
    return { liked: !!like, ...(like && { likedAt: like.likedAt }) };
  };
}
