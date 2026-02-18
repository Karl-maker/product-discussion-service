import type { ClipResultsRepository } from "../../infrastructure/repositories/clip-results.repository";
import type { ClipSnapshot } from "../../domain/types/clip-result.types";

export class GetClipSnapshotUseCase {
  constructor(private readonly repo: ClipResultsRepository) {}

  async execute(clipId: string): Promise<ClipSnapshot | null> {
    return this.repo.getSnapshot(clipId);
  }
}
