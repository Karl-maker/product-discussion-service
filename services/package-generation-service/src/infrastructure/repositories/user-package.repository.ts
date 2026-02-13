import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { GeneratedPackage } from "../../domain/types";

/** Stored package item (matches conversation-package-service table shape). */
export interface StoredPackage {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags: string[];
  conversations: GeneratedPackage["conversations"];
  createdAt: string;
  updatedAt: string;
  notes?: GeneratedPackage["notes"];
  userId: string;
  targetLanguage: string;
}

export class UserPackageRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("CONVERSATION_PACKAGES_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  /** Find the user's package for this targetLanguage (at most one). Case-insensitive via targetLanguageNorm; falls back to exact match for items without norm. */
  async findByUserIdAndLanguage(userId: string, targetLanguage: string): Promise<StoredPackage | null> {
    const tlNorm = (targetLanguage || "").trim().toLowerCase();
    const tlExact = (targetLanguage || "").trim();
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "#uid = :uid AND (#tlNorm = :tlNorm OR (attribute_not_exists(#tlNorm) AND #tl = :tl))",
        ExpressionAttributeNames: { "#uid": "userId", "#tl": "targetLanguage", "#tlNorm": "targetLanguageNorm" },
        ExpressionAttributeValues: { ":uid": userId, ":tlNorm": tlNorm, ":tl": tlExact },
        Limit: 2,
      })
    );
    const items = (result.Items ?? []) as Array<Record<string, unknown>>;
    if (items.length === 0) return null;
    return mapToStored(items[0]);
  }

  /** Create or update package. */
  async save(pkg: StoredPackage): Promise<void> {
    const item: Record<string, unknown> = {
      PK: `PACKAGE#${pkg.id}`,
      SK: `METADATA#${pkg.id}`,
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      category: pkg.category,
      tags: pkg.tags,
      conversations: pkg.conversations,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
      userId: pkg.userId,
    };
    if (pkg.notes !== undefined) item.notes = pkg.notes;
    const targetLang = (pkg.targetLanguage || "").trim().toLowerCase();
    item.targetLanguage = targetLang;
    item.targetLanguageNorm = targetLang;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );
  }
}

function mapToStored(item: Record<string, unknown>): StoredPackage {
  const val = item.targetLanguage ?? item.lang ?? item.language;
  return {
    id: item.id as string,
    name: item.name as string,
    description: item.description as string | undefined,
    category: item.category as string,
    tags: (item.tags as string[]) ?? [],
    conversations: (item.conversations as StoredPackage["conversations"]) ?? [],
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
    notes: item.notes as StoredPackage["notes"],
    userId: item.userId as string,
    targetLanguage: typeof val === "string" ? val : "",
  };
}
