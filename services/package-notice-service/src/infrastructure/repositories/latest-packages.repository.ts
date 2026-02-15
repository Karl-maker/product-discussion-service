import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

export interface LatestPackageForUser {
  userId: string;
  packageId: string;
  name: string;
  description?: string;
  targetLanguage: string;
  updatedAt: string;
  notes?: { title?: string; details?: string; content?: string };
}

const BATCH_SIZE = 500;
const MAX_USERS = 100;

/**
 * Scans conversation packages table for items with userId,
 * groups by userId keeping the latest (by updatedAt) per user,
 * returns up to MAX_USERS users.
 */
export class LatestPackagesRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) throw new Error("CONVERSATION_PACKAGES_TABLE is not set");
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getLatestPackagePerUser(): Promise<LatestPackageForUser[]> {
    const byUser = new Map<string, LatestPackageForUser>();
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await this.client.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: "attribute_exists(#uid)",
          ExpressionAttributeNames: { "#uid": "userId" },
          Limit: BATCH_SIZE,
          ExclusiveStartKey: lastKey,
        })
      );

      const items = (result.Items ?? []) as Array<{
        id?: string;
        userId?: string;
        name?: string;
        description?: string;
        targetLanguage?: string;
        updatedAt?: string;
        createdAt?: string;
        notes?: { title?: string; details?: string; content?: string };
      }>;

      for (const item of items) {
        const userId = item.userId;
        if (!userId || typeof userId !== "string") continue;
        const updatedAt = item.updatedAt ?? item.createdAt ?? "";
        const existing = byUser.get(userId);
        if (!existing || updatedAt > existing.updatedAt) {
          byUser.set(userId, {
            userId,
            packageId: item.id ?? "",
            name: typeof item.name === "string" ? item.name : "Lesson",
            description: typeof item.description === "string" ? item.description : undefined,
            targetLanguage: typeof item.targetLanguage === "string" ? item.targetLanguage : "",
            updatedAt,
            notes: item.notes,
          });
        }
      }

      lastKey = result.LastEvaluatedKey;
      if (byUser.size >= MAX_USERS) break;
    } while (lastKey);

    return Array.from(byUser.values()).slice(0, MAX_USERS);
  }
}
