import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { AnalysisResultRecord } from "../../domain/types";

/** Stored target shape in DynamoDB. */
interface StoredTarget {
  key: string;
  description?: string;
  check?: string;
  amount?: number;
}

export class AnalysisResultRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("ANALYSIS_RESULTS_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  /** List analysis results for a user, newest first. Used to get results since lastProcessedAt. */
  async listByUserId(userId: string, limit?: number): Promise<AnalysisResultRecord[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}` },
        Limit: limit ?? 100,
        ScanIndexForward: false,
      })
    );

    const items = (result.Items ?? []) as Array<{
      userId: string;
      conversationPackageId: string;
      topicKey: string;
      result: AnalysisResultRecord["result"];
      targetLanguage?: string;
      targetsHit?: StoredTarget[];
      targetsMissed?: StoredTarget[];
      createdAt: string;
    }>;

    return items.map((item) => ({
      userId: item.userId,
      conversationPackageId: item.conversationPackageId,
      topicKey: item.topicKey,
      result: item.result,
      targetLanguage: item.targetLanguage,
      targetsHit: normalizeTargets(item.targetsHit),
      targetsMissed: normalizeTargets(item.targetsMissed),
      createdAt: item.createdAt,
    }));
  }
}

function normalizeTargets(arr: unknown): AnalysisResultRecord["targetsHit"] {
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => {
    const o = typeof t === "object" && t !== null ? (t as Record<string, unknown>) : {};
    return {
      key: String(o.key ?? ""),
      description: String(o.description ?? ""),
      check: String(o.check ?? ""),
      amount: typeof o.amount === "number" ? o.amount : undefined,
    };
  });
}
