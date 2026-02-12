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

function parseRecordBody(body: string): VoiceSessionRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  const o = parsed as Record<string, unknown>;
  const sessionId = (o.sessionId ?? o.session_id) as string | undefined;
  if (!sessionId || typeof sessionId !== "string") return null;
  const createdAt = (o.createdAt ?? o.created_at) as string | undefined;
  const expiresAt = (o.expiresAt ?? o.expires_at) as string | undefined;
  let ttl = typeof o.ttl === "number" ? o.ttl : Number(o.ttl);
  if (!Number.isFinite(ttl) && expiresAt) {
    const ms = new Date(expiresAt).getTime();
    ttl = Math.floor(ms / 1000) + 30 * 24 * 60 * 60;
  }
  if (!Number.isFinite(ttl)) return null;
  return {
    sessionId,
    userId: (o.userId ?? o.user_id) as string | undefined,
    createdAt: typeof createdAt === "string" ? createdAt : new Date().toISOString(),
    expiresAt: typeof expiresAt === "string" ? expiresAt : new Date((ttl - 30 * 24 * 60 * 60) * 1000).toISOString(),
    ttl,
  };
}

async function processVoiceSessionQueue(event: SQSEvent): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> {
  const { voiceSessionRepository } = bootstrap();
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  if (!voiceSessionRepository) {
    for (const record of event.Records!) {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
    return { batchItemFailures };
  }

  for (const record of event.Records!) {
    try {
      const body = parseRecordBody(record.body);
      if (!body) {
        console.error("Invalid or missing voice session fields in message:", record.messageId);
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }
      await voiceSessionRepository.save(body);
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
