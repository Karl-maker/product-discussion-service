import type { ClipResultsRepository } from "../../infrastructure/repositories/clip-results.repository";
import type { ClipAttempt } from "../../domain/types/clip-result.types";

export class GetLatestResultUseCase {
  constructor(private readonly repo: ClipResultsRepository) {}

  async execute(userId: string, clipId: string): Promise<ClipAttempt | null> {
    return this.repo.getLatestAttempt(userId, clipId);
  }
}
