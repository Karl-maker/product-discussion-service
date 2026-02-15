import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export interface LessonNoticeMessage {
  template: "lesson.hbs";
  header: string;
  to: string;
  content: {
    userId: string;
    lessonName: string;
    description: string;
    lessonUrl: string;
    note?: string;
    pastFeedback?: string[];
  };
}

export class EmailQueueClient {
  private readonly queueUrl: string;
  private readonly client: SQSClient;
  private readonly appBaseUrl: string;

  constructor(queueUrl: string, appBaseUrl: string = "https://app.wittytalk.ai") {
    if (!queueUrl) throw new Error("EMAIL_SERVICE_QUEUE_URL is not set");
    this.queueUrl = queueUrl;
    this.client = new SQSClient({});
    this.appBaseUrl = appBaseUrl.replace(/\/$/, "");
  }

  async sendLessonNotice(message: LessonNoticeMessage): Promise<void> {
    const body = JSON.stringify({
      template: message.template,
      header: message.header,
      to: message.to,
      content: {
        userId: message.content.userId,
        lessonName: message.content.lessonName,
        description: message.content.description,
        lessonUrl: message.content.lessonUrl,
        ...(message.content.note != null && { note: message.content.note }),
        ...(message.content.pastFeedback != null && message.content.pastFeedback.length > 0 && {
          pastFeedback: message.content.pastFeedback.slice(0, 5),
        }),
      },
    });

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: body,
      })
    );
  }
}
