import { ConversationPackageRepository } from "../../infrastructure/repositories/conversation-package.repository";
import type {
  ConversationPackage,
  PackageConversation,
  PackageNotes,
} from "../../domain/types/package.types";

export interface CreatePackageInput {
  name: string;
  description?: string;
  category: string;
  tags: string[];
  conversations: PackageConversation[];
  notes?: PackageNotes;
  userId?: string;
  language?: string;
}

export class CreatePackageUseCase {
  constructor(private readonly repository: ConversationPackageRepository) {}

  async execute(input: CreatePackageInput): Promise<ConversationPackage> {
    const id = `pkg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const pkg: ConversationPackage = {
      id,
      name: input.name,
      description: input.description,
      category: input.category,
      tags: input.tags ?? [],
      conversations: input.conversations ?? [],
      createdAt: now,
      updatedAt: now,
    };
    if (input.notes !== undefined) pkg.notes = input.notes;
    if (input.userId !== undefined) pkg.userId = input.userId;
    if (input.language !== undefined) pkg.language = input.language;

    await this.repository.save(pkg);
    return pkg;
  }
}
