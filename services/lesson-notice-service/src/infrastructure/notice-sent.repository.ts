import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const TTL_DAYS = 7;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

export class NoticeSentRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) throw new Error("NOTICE_SENT_TABLE is required");
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  /** Returns true if this user was sent a notice in the last 7 days. */
  async wasSentInLast7Days(userId: string): Promise<boolean> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `USER#${userId}`, SK: "LESSON_NOTICE" },
      })
    );
    if (!result.Item) return false;
    const sentAt = result.Item.sentAt as string;
    const ttl = result.Item.ttl as number;
    const nowSec = Math.floor(Date.now() / 1000);
    if (ttl && nowSec < ttl) return true;
    if (sentAt) {
      const sentTime = new Date(sentAt).getTime();
      if (Date.now() - sentTime < TTL_DAYS * 24 * 60 * 60 * 1000) return true;
    }
    return false;
  }

  /** Record that we sent a notice to this user. TTL 7 days. */
  async recordSent(userId: string): Promise<void> {
    const now = new Date();
    const ttl = Math.floor(now.getTime() / 1000) + TTL_SECONDS;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${userId}`,
          SK: "LESSON_NOTICE",
          sentAt: now.toISOString(),
          ttl,
        },
      })
    );
  }
}
