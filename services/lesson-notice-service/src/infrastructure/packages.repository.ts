import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { PackageItem } from "../domain/types";

export class PackagesRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) throw new Error("CONVERSATION_PACKAGES_TABLE is required");
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  /**
   * Scan packages that have userId (user-owned), then return the latest package per user (by updatedAt).
   * Uses a single scan with a reasonable limit; for large tables you may need to paginate.
   */
  async getLatestPackagePerUser(limitScanned: number): Promise<Map<string, PackageItem>> {
    const map = new Map<string, PackageItem>();
    let lastKey: Record<string, unknown> | undefined;
    let totalScanned = 0;

    do {
      const result = await this.client.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: "attribute_exists(#uid)",
          ExpressionAttributeNames: { "#uid": "userId" },
          Limit: Math.min(500, limitScanned - totalScanned),
          ExclusiveStartKey: lastKey,
        })
      );

      const items = (result.Items ?? []) as Array<Record<string, unknown>>;
      totalScanned += items.length;
      for (const item of items) {
        const userId = item.userId as string;
        if (!userId) continue;
        const updatedAt = String(item.updatedAt ?? item.createdAt ?? "");
        const existing = map.get(userId);
        if (!existing || updatedAt > existing.updatedAt) {
          map.set(userId, {
            id: item.id as string,
            name: item.name as string,
            description: item.description as string | undefined,
            userId,
            targetLanguage: item.targetLanguage as string | undefined,
            updatedAt,
            notes: item.notes as PackageItem["notes"],
          });
        }
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey && totalScanned < limitScanned);

    return map;
  }
}
