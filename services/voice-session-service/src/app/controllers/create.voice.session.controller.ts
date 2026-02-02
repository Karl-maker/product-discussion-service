import { RequestContext } from "../../handler/api-gateway/types";
import { CreateVoiceSessionUseCase } from "../usecases/create.voice.session.usecase";

export class CreateVoiceSessionController {
  constructor(
    private readonly useCase: CreateVoiceSessionUseCase
  ) {}

  handle = async (req: RequestContext) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const { instructions, text_only } = body;
    const userId = req.user?.id;

    return await this.useCase.execute({
      instructions: typeof instructions === "string" ? instructions : undefined,
      textOnlyOutput: text_only === true || text_only === "true",
      userId: userId,
    });
  };
}
