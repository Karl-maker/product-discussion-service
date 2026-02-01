import type { RequestContext } from "../../handler/api-gateway/types";
import { CreateConversationUserUseCase } from "../usecases/create.conversation.user.usecase";

export class CreateConversationUserController {
  constructor(private readonly useCase: CreateConversationUserUseCase) {}

  handle = async (req: RequestContext) => {
    if (!req.user?.id) {
      const err = new Error("Unauthorized");
      (err as Error & { name: string }).name = "AuthenticationError";
      throw err;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { language, targetLanguage, profession, timezone, country, purposeOfUsage } = body;

    return this.useCase.execute({
      userId: req.user.id,
      language: typeof language === "string" ? language : undefined,
      targetLanguage: typeof targetLanguage === "string" ? targetLanguage : undefined,
      profession: typeof profession === "string" ? profession : undefined,
      timezone: typeof timezone === "string" ? timezone : undefined,
      country: typeof country === "string" ? country : undefined,
      purposeOfUsage: typeof purposeOfUsage === "string" ? purposeOfUsage : undefined,
    });
  };
}
