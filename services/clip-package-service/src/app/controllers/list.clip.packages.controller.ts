import type { RequestContext } from "../../handler/api-gateway/types";
import { ListClipPackagesUseCase } from "../usecases/list.clip.packages.usecase";

export class ListClipPackagesController {
  constructor(private readonly useCase: ListClipPackagesUseCase) {}

  handle = async (req: RequestContext) => {
    const language = req.query?.language ?? req.query?.lang;
    if (!language || typeof language !== "string") {
      const err = new Error("Query parameter 'language' is required");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    const characterName = req.query?.characterName ?? req.query?.character;
    const page = Math.max(1, parseInt(req.query?.page ?? "1", 10) || 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query?.pageSize ?? req.query?.page_size ?? "10", 10) || 10, 1),
      50
    );
    const randomize = req.query?.randomize !== "false" && req.query?.randomize !== "0";

    return this.useCase.execute({
      language,
      characterName: typeof characterName === "string" ? characterName : undefined,
      page,
      pageSize,
      randomize,
    });
  };
}
