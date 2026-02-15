import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

/** Fetch last 5 feedback strings for a user from analysis results (newest first). */
export class AnalysisFeedbackRepository {
  private readonly tableName: string | null;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string | undefined) {
    this.tableName = tableName ?? null;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getRecentFeedbackStrings(userId: string, maxCount: number): Promise<string[]> {
    if (!this.tableName) return [];
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}` },
        Limit: 20,
        ScanIndexForward: false,
      })
    );
    const items = (result.Items ?? []) as Array<{ result?: { feedback?: Array<{ content?: string }> } }>;
    const list: string[] = [];
    for (const item of items) {
      const feedback = item.result?.feedback ?? [];
      for (const f of feedback) {
        if (typeof f.content === "string" && f.content.trim()) {
          list.push(f.content.trim());
          if (list.length >= maxCount) return list;
        }
      }
    }
    return list;
  }
}
