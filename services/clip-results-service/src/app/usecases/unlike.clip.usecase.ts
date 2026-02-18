import type { ClipResultsRepository } from "../../infrastructure/repositories/clip-results.repository";

export interface UnlikeClipOutput {
  removed: boolean;
  totalLikes: number;
}

export class UnlikeClipUseCase {
  constructor(private readonly repo: ClipResultsRepository) {}

  async execute(userId: string, clipId: string): Promise<UnlikeClipOutput> {
    const removed = await this.repo.deleteLike(userId, clipId);
    if (removed) {
      await this.repo.incrementSnapshotLikes(clipId, -1);
    }
    const snapshot = await this.repo.getSnapshot(clipId);
    return {
      removed,
      totalLikes: snapshot?.totalLikes ?? 0,
    };
  }
}
