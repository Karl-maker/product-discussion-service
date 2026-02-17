import type { ClipPackageRepository } from "../../infrastructure/repositories/clip-package.repository";
import type { CreateClipPackageInput, ClipPackage } from "../../domain/types/clip-package.types";

export class CreateClipPackageUseCase {
  constructor(private readonly repo: ClipPackageRepository) {}

  async execute(input: CreateClipPackageInput): Promise<ClipPackage> {
    const id = `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    return this.repo.create({
      id,
      thumbnailUrl: input.thumbnailUrl.trim(),
      mediaUrl: input.mediaUrl.trim(),
      characterName: input.characterName?.trim(),
      usedWords: Array.isArray(input.usedWords) ? input.usedWords : [],
      caption: input.caption.trim(),
      language: input.language.trim(),
    });
  }
}
