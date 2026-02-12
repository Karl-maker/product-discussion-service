import type { RequestContext } from "../../handler/api-gateway/types";
import { GetPackageUseCase } from "../usecases/get.package.usecase";

export class GetPackageController {
  constructor(private readonly useCase: GetPackageUseCase) {}

  handle = async (req: RequestContext) => {
    const id = req.pathParams?.id;
    if (!id) {
      throw new Error("id is required in path");
    }

    const pkg = await this.useCase.execute({ id, currentUserId: req.user?.id });
    if (!pkg) {
      throw new Error("Package not found");
    }
    return pkg;
  };
}
