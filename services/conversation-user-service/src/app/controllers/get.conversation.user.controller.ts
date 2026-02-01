import type { RequestContext } from "../../handler/api-gateway/types";
import { GetConversationUserUseCase } from "../usecases/get.conversation.user.usecase";

export class GetConversationUserController {
  constructor(private readonly useCase: GetConversationUserUseCase) {}

  handle = async (req: RequestContext) => {
    if (!req.user?.id) {
      const err = new Error("Unauthorized");
      (err as Error & { name: string }).name = "AuthenticationError";
      throw err;
    }
    const userId = req.user.id;

    const user = await this.useCase.execute({ userId });
    if (!user) {
      const err = new Error("User not found");
      err.name = "NotFoundError";
      throw err;
    }
    return user;
  };
}
