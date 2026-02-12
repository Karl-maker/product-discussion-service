import { bootstrap } from "../../bootstrap";
import type { RequestContext } from "./types";

const {
  createPackageController,
  getPackageController,
  listPackagesController,
  listMyPackagesController,
  updatePackageController,
  deletePackageController,
  analyzeTranscriptController,
  listAnalysisResultsController,
} = bootstrap();

export const routes: Record<string, (req: RequestContext) => Promise<unknown>> = {
  "POST /packages": createPackageController.handle,
  "GET /packages": listPackagesController.handle,
  "GET /packages/mine": listMyPackagesController.handle,
  "POST /packages/analyze-transcript": analyzeTranscriptController.handle,
  "GET /packages/{id}": getPackageController.handle,
  "PUT /packages/{id}": updatePackageController.handle,
  "DELETE /packages/{id}": deletePackageController.handle,
  "GET /packages/analysis-results": listAnalysisResultsController.handle,
};
