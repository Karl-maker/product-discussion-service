import type { RequestContext } from "../../handler/api-gateway/types";
import { CreateConversationUserUseCase } from "../usecases/create.conversation.user.usecase";

export class CreateConversationUserController {
  constructor(private readonly useCase: CreateConversationUserUseCase) {}

  handle = async (req: RequestContext) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { userId, language, targetLanguage, profession, timezone, country, purposeOfUsage } = body;

    if (!userId || typeof userId !== "string") {
      throw new Error("userId is required");
    }

    return this.useCase.execute({
      userId,
      language: typeof language === "string" ? language : undefined,
      targetLanguage: typeof targetLanguage === "string" ? targetLanguage : undefined,
      profession: typeof profession === "string" ? profession : undefined,
      timezone: typeof timezone === "string" ? timezone : undefined,
      country: typeof country === "string" ? country : undefined,
      purposeOfUsage: typeof purposeOfUsage === "string" ? purposeOfUsage : undefined,
    });
  };
}
