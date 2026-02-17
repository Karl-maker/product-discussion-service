import type { ClipPackageRepository } from "../../infrastructure/repositories/clip-package.repository";

export class DeleteClipPackageUseCase {
  constructor(private readonly repo: ClipPackageRepository) {}

  async execute(id: string): Promise<boolean> {
    return this.repo.delete(id);
  }
}
