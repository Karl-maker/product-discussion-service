import type { ClipPackageRepository } from "../../infrastructure/repositories/clip-package.repository";
import type { ClipPackage } from "../../domain/types/clip-package.types";

export class GetClipPackageUseCase {
  constructor(private readonly repo: ClipPackageRepository) {}

  async execute(id: string): Promise<ClipPackage | null> {
    return this.repo.getById(id);
  }
}
