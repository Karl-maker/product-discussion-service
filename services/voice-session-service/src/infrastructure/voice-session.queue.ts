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
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(record),
      })
    );
  }
}
