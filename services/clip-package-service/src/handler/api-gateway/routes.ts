import { bootstrap } from "../../bootstrap";
import type { RequestContext } from "./types";

const {
  createClipPackageController,
  getClipPackageController,
  listClipPackagesController,
  updateClipPackageController,
  deleteClipPackageController,
} = bootstrap();

export const routes: Record<string, (req: RequestContext) => Promise<unknown>> = {
  "POST /clip-packages": createClipPackageController.handle,
  "GET /clip-packages": listClipPackagesController.handle,
  "GET /clip-packages/{id}": getClipPackageController.handle,
  "GET /clip-packages/{proxy}": getClipPackageController.handle,
  "PUT /clip-packages/{id}": updateClipPackageController.handle,
  "PUT /clip-packages/{proxy}": updateClipPackageController.handle,
  "DELETE /clip-packages/{id}": deleteClipPackageController.handle,
  "DELETE /clip-packages/{proxy}": deleteClipPackageController.handle,
};
