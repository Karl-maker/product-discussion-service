import type { RequestContext } from "../../handler/api-gateway/types";
import { DeleteClipPackageUseCase } from "../usecases/delete.clip.package.usecase";

export class DeleteClipPackageController {
  constructor(private readonly useCase: DeleteClipPackageUseCase) {}

  handle = async (req: RequestContext) => {
    const id = req.pathParams?.id ?? req.pathParams?.proxy;
    if (!id) {
      const err = new Error("Missing clip package id");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    const deleted = await this.useCase.execute(id);
    if (!deleted) {
      const err = new Error("Clip package not found");
      (err as Error & { name: string }).name = "NotFoundError";
      throw err;
    }
    return { deleted: true };
  };
}
