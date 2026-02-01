import { ConversationUserRepository } from "../../infrastructure/repositories/conversation-user.repository";
import type { ConversationUser } from "../../domain/types/user.types";

export interface CreateConversationUserInput {
  userId: string;
  language?: string;
  targetLanguage?: string;
  profession?: string;
  timezone?: string;
  country?: string;
  purposeOfUsage?: string;
}

export class CreateConversationUserUseCase {
  constructor(private readonly repository: ConversationUserRepository) {}

  async execute(input: CreateConversationUserInput): Promise<ConversationUser> {
    const now = new Date().toISOString();

    const user: ConversationUser = {
      userId: input.userId,
      language: input.language,
      targetLanguage: input.targetLanguage,
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
}
