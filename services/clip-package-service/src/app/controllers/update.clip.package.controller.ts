import type { RequestContext } from "../../handler/api-gateway/types";
import { UpdateClipPackageUseCase } from "../usecases/update.clip.package.usecase";
import type { UpdateClipPackageInput, UsedWord } from "../../domain/types/clip-package.types";

function parseUsedWords(raw: unknown): UsedWord[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map((x) => {
    const o = (x as Record<string, unknown>) ?? {};
    return {
      word: String(o.word ?? ""),
      timestamp: String(o.timestamp ?? ""),
    };
  });
}

export class UpdateClipPackageController {
  constructor(private readonly useCase: UpdateClipPackageUseCase) {}

  handle = async (req: RequestContext) => {
    const id = req.pathParams?.id ?? req.pathParams?.proxy;
    if (!id) {
      const err = new Error("Missing clip package id");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { thumbnailUrl, mediaUrl, characterName, usedWords, caption, language } = body;

    const input: UpdateClipPackageInput = {
      id,
      thumbnailUrl: typeof thumbnailUrl === "string" ? thumbnailUrl : undefined,
      mediaUrl: typeof mediaUrl === "string" ? mediaUrl : undefined,
      characterName: typeof characterName === "string" ? characterName : undefined,
      usedWords: parseUsedWords(usedWords),
      caption: typeof caption === "string" ? caption : undefined,
      language: typeof language === "string" ? language : undefined,
    };
    const updated = await this.useCase.execute(input);
    if (!updated) {
      const err = new Error("Clip package not found");
      (err as Error & { name: string }).name = "NotFoundError";
      throw err;
    }
    return updated;
  };
}
