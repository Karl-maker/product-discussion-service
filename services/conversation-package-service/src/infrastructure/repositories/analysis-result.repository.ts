import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { ConversationTarget, TranscriptAnalysisResult } from "../../domain/types/package.types";

/** Stored target with key, description, check, amount (for targetsHit / targetsMissed). */
export type StoredTarget = ConversationTarget;

export interface AnalysisResultRecord {
  userId: string;
  conversationPackageId: string;
  topicKey: string;
  result: TranscriptAnalysisResult;
  /** Language targeted for words-used analysis (optional). */
  targetLanguage?: string;
  /** Targets that were met (full detail: key, description, check, amount). */
  targetsHit: StoredTarget[];
  /** Targets that were not met (full detail). */
  targetsMissed: StoredTarget[];
  createdAt: string;
  /** DynamoDB TTL: Unix seconds; items expire after 90 days. */
  ttl: number;
}

export class AnalysisResultRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("ANALYSIS_RESULTS_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async save(record: AnalysisResultRecord): Promise<void> {
    const now = record.createdAt;
    const sk = `PACKAGE#${record.conversationPackageId}#TOPIC#${record.topicKey}#TS#${now}`;

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${record.userId}`,
          SK: sk,
          userId: record.userId,
          conversationPackageId: record.conversationPackageId,
          topicKey: record.topicKey,
          result: record.result,
          targetLanguage: record.targetLanguage,
          targetsHit: record.targetsHit,
          targetsMissed: record.targetsMissed,
          createdAt: now,
          ttl: record.ttl,
        },
      })
    );
  }

  /** List analysis results for a user, optionally by package or topic. */
  async listByUserId(
    userId: string,
    options?: { conversationPackageId?: string; topicKey?: string; limit?: number }
  ): Promise<AnalysisResultRecord[]> {
    const limit = options?.limit ?? 50;
    let keyCondition = "PK = :pk";
    const exprValues: Record<string, string> = { ":pk": `USER#${userId}` };

    if (options?.conversationPackageId) {
      keyCondition += " AND begins_with(SK, :skPrefix)";
      exprValues[":skPrefix"] = `PACKAGE#${options.conversationPackageId}#TOPIC#`;
    }
    if (options?.topicKey && options?.conversationPackageId) {
      exprValues[":skPrefix"] = `PACKAGE#${options.conversationPackageId}#TOPIC#${options.topicKey}#TS#`;
    }

    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: exprValues,
        Limit: limit,
        ScanIndexForward: false,
      })
    );

    const items = (result.Items ?? []) as Array<{
      userId: string;
      conversationPackageId: string;
      topicKey: string;
      result: TranscriptAnalysisResult;
      targetLanguage?: string;
      targetsHit?: StoredTarget[];
      targetsMissed?: StoredTarget[];
      createdAt: string;
      ttl?: number;
    }>;

    return items.map((item) => ({
      userId: item.userId,
      conversationPackageId: item.conversationPackageId,
      topicKey: item.topicKey,
      result: item.result,
      targetLanguage: item.targetLanguage,
      targetsHit: normalizeStoredTargets(item.targetsHit),
      targetsMissed: normalizeStoredTargets(item.targetsMissed),
      createdAt: item.createdAt,
      ttl: item.ttl ?? 0,
    }));
  }
}

function normalizeStoredTargets(arr: unknown): StoredTarget[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => {
    if (typeof t === "string") {
      return { key: t, description: "", check: "" };
    }
    const o = t as Record<string, unknown>;
    return {
      key: String(o.key ?? ""),
      description: String(o.description ?? ""),
      check: String(o.check ?? ""),
      amount: typeof o.amount === "number" ? o.amount : undefined,
    };
  });
}
