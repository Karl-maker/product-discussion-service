import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { VoiceSessionRecord } from "./repositories/voice-session.repository";

export interface VoiceSessionQueue {
  send(record: VoiceSessionRecord): Promise<void>;
}

export class SQSVoiceSessionQueue implements VoiceSessionQueue {
  private readonly queueUrl: string;
  private readonly client: SQSClient;

  constructor(queueUrl: string) {
    if (!queueUrl) {
      throw new Error("VOICE_SESSION_QUEUE_URL environment variable is not set");
    }
    this.queueUrl = queueUrl;
    this.client = new SQSClient({});
  }

  async send(record: VoiceSessionRecord): Promise<void> {
    // Deduplication by userId only; FIFO requires an id so fallback when no userId
    const dedupeId = record.userId ?? `anonymous-${record.sessionId}`;
    const groupId = record.userId ?? "default";
    // Always include userId and targetLanguage in payload (JSON.stringify omits undefined)
    const body: Record<string, unknown> = {
      sessionId: record.sessionId,
      userId: record.userId ?? null,
      targetLanguage: record.targetLanguage ?? null,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      ttl: record.ttl,
    };
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(body),
        MessageDeduplicationId: dedupeId,
        MessageGroupId: groupId,
      })
    );
  }
}
