import type { ClipResultsRepository } from "../../infrastructure/repositories/clip-results.repository";

export interface LikeClipOutput {
  liked: boolean;
  totalLikes: number;
}

export class LikeClipUseCase {
  constructor(private readonly repo: ClipResultsRepository) {}

  async execute(userId: string, clipId: string): Promise<LikeClipOutput> {
    const added = await this.repo.putLike({
      userId,
      clipId,
      likedAt: new Date().toISOString(),
    });
    if (added) {
      await this.repo.incrementSnapshotLikes(clipId, 1);
    }
    const snapshot = await this.repo.getSnapshot(clipId);
    return {
      liked: added,
      totalLikes: snapshot?.totalLikes ?? 0,
    };
  }
}
