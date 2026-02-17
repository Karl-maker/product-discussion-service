import type { RequestContext } from "../../handler/api-gateway/types";
import { CreateClipPackageUseCase } from "../usecases/create.clip.package.usecase";
import type { CreateClipPackageInput, UsedWord } from "../../domain/types/clip-package.types";

function parseUsedWords(raw: unknown): UsedWord[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map((x) => {
    const o = (x as Record<string, unknown>) ?? {};
    return {
      word: String(o.word ?? ""),
      pronunciation: String(o.pronunciation ?? ""),
      meaning: String(o.meaning ?? ""),
      timestamp: String(o.timestamp ?? ""),
    };
  });
}

export class CreateClipPackageController {
  constructor(private readonly useCase: CreateClipPackageUseCase) {}

  handle = async (req: RequestContext) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { thumbnailUrl, mediaUrl, characterName, usedWords, caption, language } = body;

    const input: CreateClipPackageInput = {
      thumbnailUrl: typeof thumbnailUrl === "string" ? thumbnailUrl : "",
      mediaUrl: typeof mediaUrl === "string" ? mediaUrl : "",
      characterName: typeof characterName === "string" ? characterName : undefined,
      usedWords: parseUsedWords(usedWords),
      caption: typeof caption === "string" ? caption : "",
      language: typeof language === "string" ? language : "",
    };
    return this.useCase.execute(input);
  };
}
