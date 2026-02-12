import { apiHandler } from "./api-gateway/handler";
import { bootstrap } from "../bootstrap";
import type { VoiceSessionRecord } from "../infrastructure/repositories/voice-session.repository";

type SQSEvent = { Records?: Array<{ messageId: string; body: string }> };

function isSQSEvent(event: unknown): event is SQSEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    Array.isArray((event as SQSEvent).Records)
  );
}

async function processVoiceSessionQueue(event: SQSEvent): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> {
  const { voiceSessionRepository } = bootstrap();
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records!) {
    try {
      const body = JSON.parse(record.body) as VoiceSessionRecord;
      if (!body.sessionId || !body.createdAt || !body.expiresAt || typeof body.ttl !== "number") {
        throw new Error("Invalid voice session record");
      }
      await voiceSessionRepository.save({
        sessionId: body.sessionId,
        userId: body.userId,
        createdAt: body.createdAt,
        expiresAt: body.expiresAt,
        ttl: body.ttl,
      });
    } catch (err) {
      console.error("Failed to store voice session from queue:", record.messageId, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}

export async function handler(event: unknown): Promise<unknown> {
  if (isSQSEvent(event)) {
    return processVoiceSessionQueue(event);
  }
  return apiHandler(event as import("aws-lambda").APIGatewayProxyEvent);
}
