import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { LessonNoticeEmailPayload } from "../domain/types";

export class EmailQueueClient {
  private readonly queueUrl: string;
  private readonly client: SQSClient;

  constructor(queueUrl: string) {
    if (!queueUrl) throw new Error("EMAIL_QUEUE_URL is required");
    this.queueUrl = queueUrl;
    this.client = new SQSClient({});
  }

  async sendLessonNotice(payload: LessonNoticeEmailPayload): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
  }
}
