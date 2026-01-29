import { ConversationRepository } from "../../infrastructure/repositories/conversation.repository";
import { UsageEventSQSClient } from "../../infrastructure/sqs.client";
import { Conversation } from "../../domain/types/conversation.types";

export interface PingConversationInput {
  id: string;
  userId: string;
}

export interface PingConversationOutput {
  conversation: Conversation;
  secondsElapsed: number;
}

export class PingConversationUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly sqsClient: UsageEventSQSClient
  ) {}

  async execute(input: PingConversationInput): Promise<PingConversationOutput> {
    const conversation = await this.conversationRepository.findById(input.id, input.userId);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const now = new Date();
    const lastPinged = new Date(conversation.lastPinged);
    const secondsElapsed = Math.floor((now.getTime() - lastPinged.getTime()) / 1000);

    // Update lastPinged
    const updated: Conversation = {
      ...conversation,
      lastPinged: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.conversationRepository.save(updated);

    // Send usage event to SQS
    await this.sqsClient.sendUsageEvent({
      userId: input.userId,
      entitlementKey: "feature.conversation",
      amount: secondsElapsed,
      metadata: {
        conversationId: input.id,
        conversationPlanId: conversation.conversationPlanId,
      },
    });

    return {
      conversation: updated,
      secondsElapsed,
    };
  }
}
