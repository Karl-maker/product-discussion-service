import { ConversationPackageRepository } from "../../infrastructure/repositories/conversation-package.repository";
import type { ConversationPackage } from "../../domain/types/package.types";

export interface GetPackageInput {
  id: string;
  currentUserId?: string;
}

export class GetPackageUseCase {
  constructor(private readonly repository: ConversationPackageRepository) {}

  async execute(input: GetPackageInput): Promise<ConversationPackage | null> {
    const pkg = await this.repository.findById(input.id);
    if (!pkg) return null;
    if (pkg.userId && pkg.userId !== input.currentUserId) {
      return null;
    }
    return pkg;
  }
}
