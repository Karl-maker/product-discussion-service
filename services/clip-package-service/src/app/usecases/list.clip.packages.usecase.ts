import type { ClipPackageRepository } from "../../infrastructure/repositories/clip-package.repository";
import type { ClipPackage } from "../../domain/types/clip-package.types";

/** Fisher-Yates shuffle (in-place). */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface ListClipPackagesInput {
  language: string;
  characterName?: string;
  page?: number;
  pageSize?: number;
  randomize?: boolean;
}

export interface ListClipPackagesOutput {
  items: ClipPackage[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class ListClipPackagesUseCase {
  constructor(private readonly repo: ClipPackageRepository) {}

  async execute(input: ListClipPackagesInput): Promise<ListClipPackagesOutput> {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 10));
    const randomize = input.randomize !== false;

    const all = await this.repo.listByLanguage({
      language: input.language,
      characterName: input.characterName,
      limit: 500,
    });

    const ordered = randomize ? shuffle(all) : all;
    const start = (page - 1) * pageSize;
    const items = ordered.slice(start, start + pageSize);
    const hasMore = ordered.length > start + pageSize;

    return {
      items,
      page,
      pageSize,
      hasMore,
    };
  }
}
