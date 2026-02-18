import type { ClipResultsRepository } from "../../infrastructure/repositories/clip-results.repository";
import type { ClipAttempt, ClipSnapshot } from "../../domain/types/clip-result.types";

export interface SubmitClipResultInput {
  userId: string;
  clipId: string;
  score: number;
  attemptedAt?: string;
}

export interface SubmitClipResultOutput {
  attempt: ClipAttempt;
  snapshot: ClipSnapshot;
}

export class SubmitClipResultUseCase {
  constructor(private readonly repo: ClipResultsRepository) {}

  async execute(input: SubmitClipResultInput): Promise<SubmitClipResultOutput> {
    const score = Math.max(0, Math.min(1, input.score));
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    const attempt: ClipAttempt = {
      userId: input.userId,
      clipId: input.clipId,
      score,
      attemptedAt,
    };
    await this.repo.putAttempt(attempt);

    const snapshot = await this.repo.getSnapshot(input.clipId);
    const prevTotal = snapshot?.totalAttempts ?? 0;
    const prevAvg = snapshot?.averageScore ?? 0;
    await this.repo.updateSnapshotAverage(input.clipId, score, prevTotal, prevAvg);

    const updated = await this.repo.getSnapshot(input.clipId);
    return {
      attempt,
      snapshot: updated!,
    };
  }
}
