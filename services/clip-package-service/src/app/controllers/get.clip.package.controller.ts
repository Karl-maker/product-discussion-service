import type { RequestContext } from "../../handler/api-gateway/types";
import { GetClipPackageUseCase } from "../usecases/get.clip.package.usecase";

export class GetClipPackageController {
  constructor(private readonly useCase: GetClipPackageUseCase) {}

  handle = async (req: RequestContext) => {
    const id = req.pathParams?.id ?? req.pathParams?.proxy;
    if (!id) {
      const err = new Error("Missing clip package id");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    const pkg = await this.useCase.execute(id);
    if (!pkg) {
      const err = new Error("Clip package not found");
      (err as Error & { name: string }).name = "NotFoundError";
      throw err;
    }
    return pkg;
  };
}
