import { ConversationPackageRepository } from "../../infrastructure/repositories/conversation-package.repository";

export interface DeletePackageInput {
  id: string;
  currentUserId?: string;
}

export class DeletePackageUseCase {
  constructor(private readonly repository: ConversationPackageRepository) {}

  async execute(input: DeletePackageInput): Promise<void> {
    const existing = await this.repository.findById(input.id);
    if (!existing) {
      throw new Error("Package not found");
    }
    if (existing.userId && existing.userId !== input.currentUserId) {
      throw new Error("Package not found");
    }
    await this.repository.delete(input.id);
  }
}
