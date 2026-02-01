import { ConversationUserRepository } from "../../infrastructure/repositories/conversation-user.repository";
import type { ConversationUser } from "../../domain/types/user.types";

export interface GetConversationUserInput {
  userId: string;
}

export class GetConversationUserUseCase {
  constructor(private readonly repository: ConversationUserRepository) {}

  async execute(input: GetConversationUserInput): Promise<ConversationUser | null> {
    return this.repository.findByUserId(input.userId);
  }
}
