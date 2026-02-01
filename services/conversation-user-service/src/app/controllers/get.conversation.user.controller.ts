import type { RequestContext } from "../../handler/api-gateway/types";
import { GetConversationUserUseCase } from "../usecases/get.conversation.user.usecase";

export class GetConversationUserController {
  constructor(private readonly useCase: GetConversationUserUseCase) {}

  handle = async (req: RequestContext) => {
    const userId = req.pathParams?.userId;
    if (!userId) {
      throw new Error("userId is required in path");
    }

    const user = await this.useCase.execute({ userId });
    if (!user) {
      const err = new Error("User not found");
      err.name = "NotFoundError";
      throw err;
    }
    return user;
  };
}
