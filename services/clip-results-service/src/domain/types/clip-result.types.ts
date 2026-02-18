/** One attempt: user + clip + score (0–1). */
export interface ClipAttempt {
  userId: string;
  clipId: string;
  score: number;
  attemptedAt: string;
}

/** Snapshot stored per clip: average score and total likes. */
export interface ClipSnapshot {
  clipId: string;
  averageScore: number;
  totalAttempts: number;
  totalLikes: number;
  updatedAt: string;
}

/** One like: user + clip (one like per user per clip). */
export interface ClipLike {
  userId: string;
  clipId: string;
  likedAt: string;
}
