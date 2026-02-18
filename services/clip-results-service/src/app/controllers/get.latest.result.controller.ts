import type { RequestContext } from "../../handler/api-gateway/types";
import { GetLatestResultUseCase } from "../usecases/get.latest.result.usecase";

export class GetLatestResultController {
  constructor(private readonly useCase: GetLatestResultUseCase) {}

  handle = async (req: RequestContext) => {
    const userId = req.query?.userId ?? req.query?.user_id;
    const clipId = req.query?.clipId ?? req.query?.clip_id;
    if (!userId || typeof userId !== "string" || !clipId || typeof clipId !== "string") {
      const err = new Error("Query parameters userId and clipId are required");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    const result = await this.useCase.execute(userId, clipId);
    if (!result) {
      const err = new Error("No result found");
      (err as Error & { name: string }).name = "NotFoundError";
      throw err;
    }
    return result;
  };
}
