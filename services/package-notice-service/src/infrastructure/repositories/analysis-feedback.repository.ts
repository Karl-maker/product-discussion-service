import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const MAX_FEEDBACK = 5;

/**
 * Fetches recent analysis results for a user and returns up to 5 feedback content strings (newest first).
 */
export class AnalysisFeedbackRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) throw new Error("ANALYSIS_RESULTS_TABLE is not set");
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getRecentFeedbackContent(userId: string, limit: number = MAX_FEEDBACK): Promise<string[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}` },
        Limit: 20,
        ScanIndexForward: false,
      })
    );

    const feedback: string[] = [];
    const items = (result.Items ?? []) as Array<{
      result?: { feedback?: Array<{ content?: string }> };
    }>;

    for (const item of items) {
      const list = item.result?.feedback;
      if (!Array.isArray(list)) continue;
      for (const f of list) {
        if (typeof f.content === "string" && f.content.trim()) {
          feedback.push(f.content.trim());
          if (feedback.length >= limit) return feedback;
        }
      }
    }
    return feedback;
  }
}
