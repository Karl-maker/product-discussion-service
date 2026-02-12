import type { RequestContext } from "../../handler/api-gateway/types";
import { ListPackagesUseCase } from "../usecases/list.packages.usecase";

export class ListMyPackagesController {
  constructor(private readonly useCase: ListPackagesUseCase) {}

  handle = async (req: RequestContext) => {
    const userId = req.user?.id;
    if (!userId) {
      const err = new Error("Unauthorized");
      (err as Error & { name: string }).name = "AuthenticationError";
      throw err;
    }

    const pageNumber = Number(req.query?.page_number ?? 1);
    const pageSize = Number(req.query?.page_size ?? 20);
    const language = req.query?.language as string | undefined;

    const result = await this.useCase.execute({
      filters: { language },
      pagination: { pageNumber, pageSize },
      options: { currentUserId: userId, onlyUserPackages: true },
    });

    if (result.items.length === 0 && result.total === 0) {
      const err = new Error("none found");
      (err as Error & { name: string }).name = "NotFoundError";
      throw err;
    }

    const total = result.total >= 0 ? result.total : 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;

    return {
      amount: total,
      data: result.items,
      pagination: {
        page_size: pageSize,
        page_number: pageNumber,
        total_pages: totalPages,
      },
    };
  };
}
