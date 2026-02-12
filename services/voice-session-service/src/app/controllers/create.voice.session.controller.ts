import { RequestContext } from "../../handler/api-gateway/types";
import { CreateVoiceSessionUseCase } from "../usecases/create.voice.session.usecase";

export class CreateVoiceSessionController {
  constructor(
    private readonly useCase: CreateVoiceSessionUseCase
  ) {}

  handle = async (req: RequestContext) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const { instructions, text_only, target_language, targetLanguage, language } = body;
    const userId = req.user?.id;

    const lang =
      typeof targetLanguage === "string"
        ? targetLanguage
        : typeof target_language === "string"
          ? target_language
          : typeof language === "string"
            ? language
            : undefined;

    return await this.useCase.execute({
      instructions: typeof instructions === "string" ? instructions : undefined,
      textOnlyOutput: text_only === true || text_only === "true",
      userId,
      targetLanguage: lang,
    });
  };
}
