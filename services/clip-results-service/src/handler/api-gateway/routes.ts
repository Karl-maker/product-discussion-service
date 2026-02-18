import { bootstrap } from "../../bootstrap";
import type { RequestContext } from "./types";

const {
  submitClipResultController,
  getLatestResultController,
  getClipSnapshotController,
  likeClipController,
  unlikeClipController,
  getUserLikesController,
  checkLikeController,
} = bootstrap();

export const routes: Record<string, (req: RequestContext) => Promise<unknown>> = {
  "POST clip-results": submitClipResultController.handle,
  "GET clip-results/latest": getLatestResultController.handle,
  "GET clip-results/snapshot": getClipSnapshotController.handle,
  "POST clip-results/likes": likeClipController.handle,
  "DELETE clip-results/likes": unlikeClipController.handle,
  "GET clip-results/likes": getUserLikesController.handle,
  "GET clip-results/likes/check": checkLikeController.handle,
};
