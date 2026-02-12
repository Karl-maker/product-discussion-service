import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
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
  language: string;
}

export class UserPackageRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("CONVERSATION_PACKAGES_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  /** Find the user's package for this language (at most one). */
  async findByUserIdAndLanguage(userId: string, language: string): Promise<StoredPackage | null> {
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "userId = :uid AND language = :lang",
        ExpressionAttributeValues: { ":uid": userId, ":lang": language },
        Limit: 2,
      })
    );
    const items = (result.Items ?? []) as Array<Record<string, unknown> & { id: string }>;
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
      language: pkg.language,
    };
    if (pkg.notes !== undefined) item.notes = pkg.notes;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );
  }
}

function mapToStored(item: Record<string, unknown>): StoredPackage {
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
    language: item.language as string,
  };
}
