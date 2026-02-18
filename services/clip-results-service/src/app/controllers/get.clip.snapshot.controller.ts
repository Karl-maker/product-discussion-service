import type { RequestContext } from "../../handler/api-gateway/types";
import { GetClipSnapshotUseCase } from "../usecases/get.clip.snapshot.usecase";

export class GetClipSnapshotController {
  constructor(private readonly useCase: GetClipSnapshotUseCase) {}

  handle = async (req: RequestContext) => {
    const clipId = req.query?.clipId ?? req.query?.clip_id;
    if (!clipId || typeof clipId !== "string") {
      const err = new Error("Query parameter clipId is required");
      (err as Error & { name: string }).name = "ValidationError";
      throw err;
    }
    const snapshot = await this.useCase.execute(clipId);
    if (!snapshot) {
      const err = new Error("Snapshot not found");
      (err as Error & { name: string }).name = "NotFoundError";
      throw err;
    }
    return snapshot;
  };
}
