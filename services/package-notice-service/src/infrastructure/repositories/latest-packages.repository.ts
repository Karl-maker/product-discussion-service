import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

export interface LatestPackageForUser {
  userId: string;
  packageId: string;
  name: string;
  description?: string;
  targetLanguage: string;
  createdAt: string;
  notes?: { title?: string; details?: string; content?: string };
}

const BATCH_SIZE = 500;
const MAX_USERS = 100;

const GSI_NAME = "userId-createdAt-index";

type ScanItem = {
  id?: string;
  userId?: string;
  name?: string;
  description?: string;
  targetLanguage?: string;
  updatedAt?: string;
  createdAt?: string;
  notes?: { title?: string; details?: string; content?: string };
};

/**
 * Scans the userId-createdAt-index GSI so items are keyed by userId and createdAt,
 * groups by userId keeping the latest (by createdAt) per user,
 * then returns up to MAX_USERS users with the most recently created package.
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
          IndexName: GSI_NAME,
          Limit: BATCH_SIZE,
          ExclusiveStartKey: lastKey,
        })
      );

      const items = (result.Items ?? []) as ScanItem[];

      for (const item of items) {
        const userId = item.userId;
        if (!userId || typeof userId !== "string") continue;
        const createdAt = item.createdAt ?? "";
        const existing = byUser.get(userId);
        if (!existing || createdAt > existing.createdAt) {
          byUser.set(userId, {
            userId,
            packageId: item.id ?? "",
            name: typeof item.name === "string" ? item.name : "Lesson",
            description: typeof item.description === "string" ? item.description : undefined,
            targetLanguage: typeof item.targetLanguage === "string" ? item.targetLanguage : "",
            createdAt,
            notes: item.notes,
          });
        }
      }

      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return Array.from(byUser.values())
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0))
      .slice(0, MAX_USERS);
  }
}
