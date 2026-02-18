import type { ClipResultsRepository } from "../../infrastructure/repositories/clip-results.repository";
import type { ClipLike } from "../../domain/types/clip-result.types";

export class CheckLikeUseCase {
  constructor(private readonly repo: ClipResultsRepository) {}

  async execute(userId: string, clipId: string): Promise<ClipLike | null> {
    return this.repo.getLike(userId, clipId);
  }
}
