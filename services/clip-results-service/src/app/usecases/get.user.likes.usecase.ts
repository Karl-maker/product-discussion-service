import type { ClipResultsRepository } from "../../infrastructure/repositories/clip-results.repository";
import type { ClipLike } from "../../domain/types/clip-result.types";

export class GetUserLikesUseCase {
  constructor(private readonly repo: ClipResultsRepository) {}

  async execute(userId: string): Promise<ClipLike[]> {
    return this.repo.getUserLikes(userId);
  }
}
