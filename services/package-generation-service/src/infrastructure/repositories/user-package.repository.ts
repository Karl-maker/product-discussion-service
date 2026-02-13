import { DynamoDBClient, ScanCommand as RawScanCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
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
  private readonly docClient: DynamoDBDocumentClient;
  private readonly rawClient: DynamoDBClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("CONVERSATION_PACKAGES_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.rawClient = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(this.rawClient);
  }

  /** Find the user's package for this language (at most one). Uses raw client + ExpressionAttributeNames to avoid reserved word "language". */
  async findByUserIdAndLanguage(userId: string, language: string): Promise<StoredPackage | null> {
    const result = await this.rawClient.send(
      new RawScanCommand({
        TableName: this.tableName,
        FilterExpression: "#uid = :uid AND #lang = :lang",
        ExpressionAttributeNames: { "#uid": "userId", "#lang": "language" },
        ExpressionAttributeValues: {
          ":uid": { S: userId },
          ":lang": { S: language },
        },
        Limit: 2,
      })
    );
    const items = (result.Items ?? []).map((item) => unmarshall(item) as Record<string, unknown>);
    if (items.length === 0) return null;
    return mapToStored(items[0] as Record<string, unknown> & { id: string });
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
    await this.docClient.send(
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
