import { ConversationUserRepository } from "../../infrastructure/repositories/conversation-user.repository";
import type { ConversationUser } from "../../domain/types/user.types";

export interface UpdateConversationUserInput {
  userId: string;
  language?: string;
  targetLanguage?: string;
  initialFluency?: string;
  profession?: string;
  timezone?: string;
  country?: string;
  purposeOfUsage?: string;
}

export class UpdateConversationUserUseCase {
  constructor(private readonly repository: ConversationUserRepository) {}

  async execute(input: UpdateConversationUserInput): Promise<ConversationUser> {
    const existing = await this.repository.findByUserId(input.userId);
    const now = new Date().toISOString();

    if (!existing) {
      const user: ConversationUser = {
        userId: input.userId,
        language: input.language,
        targetLanguage: input.targetLanguage,
        initialFluency: input.initialFluency,
        profession: input.profession,
        timezone: input.timezone,
        country: input.country,
        purposeOfUsage: input.purposeOfUsage,
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.save(user);
      return user;
    }

    const updated: ConversationUser = {
      ...existing,
      language: input.language !== undefined ? input.language : existing.language,
      targetLanguage: input.targetLanguage !== undefined ? input.targetLanguage : existing.targetLanguage,
      initialFluency: input.initialFluency !== undefined ? input.initialFluency : existing.initialFluency,
      profession: input.profession !== undefined ? input.profession : existing.profession,
      timezone: input.timezone !== undefined ? input.timezone : existing.timezone,
      country: input.country !== undefined ? input.country : existing.country,
      purposeOfUsage: input.purposeOfUsage !== undefined ? input.purposeOfUsage : existing.purposeOfUsage,
      updatedAt: now,
    };

    await this.repository.save(updated);
    return updated;
  }
}
