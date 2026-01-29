import { RequestContext } from "../../handler/api-gateway/types";
import { PingConversationUseCase } from "../usecases/ping.conversation.usecase";

export class PingConversationController {
  constructor(
    private readonly useCase: PingConversationUseCase
  ) {}

  handle = async (req: RequestContext) => {
    if (!req.user?.id) {
      throw new Error("User authentication required");
    }

    const id = req.pathParams.id;

    if (!id) {
      throw new Error("id is required in path");
    }

    return await this.useCase.execute({
      id,
      userId: req.user.id,
    });
  };
}
