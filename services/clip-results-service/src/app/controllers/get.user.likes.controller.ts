import type { RequestContext } from "../../handler/api-gateway/types";
import { GetUserLikesUseCase } from "../usecases/get.user.likes.usecase";

export class GetUserLikesController {
  constructor(private readonly useCase: GetUserLikesUseCase) {}

  handle = async (req: RequestContext) => {
    const userId = req.query?.userId ?? req.query?.user_id;
    if (!userId || typeof userId !== "string") {
      const err = new Error("Query parameter userId is required");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    return this.useCase.execute(userId);
  };
}
