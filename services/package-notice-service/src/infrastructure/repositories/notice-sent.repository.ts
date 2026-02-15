import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const SEVEN_DAYS_SECONDS = 7 * 24 * 3600;

export class NoticeSentRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) throw new Error("NOTICE_SENT_TABLE is not set");
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  /** Returns true if we sent a notice to this user within the last 7 days. */
  async wasSentWithinLastSevenDays(userId: string): Promise<boolean> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { userId },
      })
    );
    const item = result.Item as { userId?: string; lastSentAt?: string } | undefined;
    if (!item?.lastSentAt) return false;
    const sentAt = new Date(item.lastSentAt).getTime();
    const sevenDaysAgo = Date.now() - SEVEN_DAYS_SECONDS * 1000;
    return sentAt > sevenDaysAgo;
  }

  /** Record that we sent a notice; TTL 7 days from now. */
  async recordSent(userId: string): Promise<void> {
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + SEVEN_DAYS_SECONDS;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { userId, lastSentAt: now, ttl },
      })
    );
  }
}
