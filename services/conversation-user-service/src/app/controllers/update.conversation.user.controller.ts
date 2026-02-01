import type { RequestContext } from "../../handler/api-gateway/types";
import { UpdateConversationUserUseCase } from "../usecases/update.conversation.user.usecase";

export class UpdateConversationUserController {
  constructor(private readonly useCase: UpdateConversationUserUseCase) {}

  handle = async (req: RequestContext) => {
    if (!req.user?.id) {
      const err = new Error("Unauthorized");
      (err as Error & { name: string }).name = "AuthenticationError";
      throw err;
    }
    const userId = req.user.id;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const { language, targetLanguage, profession, timezone, country, purposeOfUsage } = body;

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
