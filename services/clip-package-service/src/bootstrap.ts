import { DynamoDBClipPackageRepository } from "./infrastructure/repositories/clip-package.repository";
import { CreateClipPackageController } from "./app/controllers/create.clip.package.controller";
import { GetClipPackageController } from "./app/controllers/get.clip.package.controller";
import { ListClipPackagesController } from "./app/controllers/list.clip.packages.controller";
import { UpdateClipPackageController } from "./app/controllers/update.clip.package.controller";
import { DeleteClipPackageController } from "./app/controllers/delete.clip.package.controller";
import { CreateClipPackageUseCase } from "./app/usecases/create.clip.package.usecase";
import { GetClipPackageUseCase } from "./app/usecases/get.clip.package.usecase";
import { ListClipPackagesUseCase } from "./app/usecases/list.clip.packages.usecase";
import { UpdateClipPackageUseCase } from "./app/usecases/update.clip.package.usecase";
import { DeleteClipPackageUseCase } from "./app/usecases/delete.clip.package.usecase";

export function bootstrap() {
  const tableName = process.env.CLIP_PACKAGES_TABLE ?? "";
  const repo = new DynamoDBClipPackageRepository(tableName);

  const createUseCase = new CreateClipPackageUseCase(repo);
  const getUseCase = new GetClipPackageUseCase(repo);
  const listUseCase = new ListClipPackagesUseCase(repo);
  const updateUseCase = new UpdateClipPackageUseCase(repo);
  const deleteUseCase = new DeleteClipPackageUseCase(repo);

  const createClipPackageController = new CreateClipPackageController(createUseCase);
  const getClipPackageController = new GetClipPackageController(getUseCase);
  const listClipPackagesController = new ListClipPackagesController(listUseCase);
  const updateClipPackageController = new UpdateClipPackageController(updateUseCase);
  const deleteClipPackageController = new DeleteClipPackageController(deleteUseCase);

  return {
    createClipPackageController,
    getClipPackageController,
    listClipPackagesController,
    updateClipPackageController,
    deleteClipPackageController,
  };
}
