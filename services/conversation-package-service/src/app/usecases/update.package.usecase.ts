import { ConversationPackageRepository } from "../../infrastructure/repositories/conversation-package.repository";
import type {
  ConversationPackage,
  PackageConversation,
  PackageNotes,
} from "../../domain/types/package.types";

export interface UpdatePackageInput {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  conversations?: PackageConversation[];
  notes?: PackageNotes;
  language?: string;
  currentUserId?: string;
}

export class UpdatePackageUseCase {
  constructor(private readonly repository: ConversationPackageRepository) {}

  async execute(input: UpdatePackageInput): Promise<ConversationPackage> {
    const existing = await this.repository.findById(input.id);
    if (!existing) {
      throw new Error("Package not found");
    }
    if (existing.userId && existing.userId !== input.currentUserId) {
      throw new Error("Package not found");
    }

    const now = new Date().toISOString();
    const pkg: ConversationPackage = {
      id: existing.id,
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      category: input.category ?? existing.category,
      tags: input.tags ?? existing.tags,
      conversations: input.conversations ?? existing.conversations,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    pkg.notes = input.notes !== undefined ? input.notes : existing.notes;
    pkg.userId = existing.userId;
    pkg.language = input.language !== undefined ? input.language : existing.language;

    await this.repository.save(pkg);
    return pkg;
  }
}
