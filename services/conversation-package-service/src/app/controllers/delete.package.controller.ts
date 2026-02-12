import type { RequestContext } from "../../handler/api-gateway/types";
import { DeletePackageUseCase } from "../usecases/delete.package.usecase";

export class DeletePackageController {
  constructor(private readonly useCase: DeletePackageUseCase) {}

  handle = async (req: RequestContext) => {
    const id = req.pathParams?.id;
    if (!id) {
      throw new Error("id is required in path");
    }

    await this.useCase.execute({ id, currentUserId: req.user?.id });
    return { deleted: true };
  };
}
