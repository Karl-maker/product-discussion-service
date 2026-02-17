import type { ClipPackageRepository } from "../../infrastructure/repositories/clip-package.repository";
import type { ClipPackage, UpdateClipPackageInput } from "../../domain/types/clip-package.types";

export class UpdateClipPackageUseCase {
  constructor(private readonly repo: ClipPackageRepository) {}

  async execute(input: UpdateClipPackageInput): Promise<ClipPackage | null> {
    const updates: Partial<ClipPackage> = {};
    if (input.thumbnailUrl !== undefined) updates.thumbnailUrl = input.thumbnailUrl.trim();
    if (input.mediaUrl !== undefined) updates.mediaUrl = input.mediaUrl.trim();
    if (input.characterName !== undefined) updates.characterName = input.characterName.trim() || undefined;
    if (input.usedWords !== undefined) updates.usedWords = Array.isArray(input.usedWords) ? input.usedWords : [];
    if (input.caption !== undefined) updates.caption = input.caption.trim();
    if (input.language !== undefined) updates.language = input.language.trim();
    return this.repo.update(input.id, updates);
  }
}
