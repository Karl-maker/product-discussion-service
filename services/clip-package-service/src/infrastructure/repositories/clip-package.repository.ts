import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ClipPackage, UsedWord } from "../../domain/types/clip-package.types";

export interface ListClipPackagesOptions {
  language: string;
  characterName?: string;
  limit?: number;
}

export interface ClipPackageRepository {
  create(pkg: Omit<ClipPackage, "createdAt" | "updatedAt">): Promise<ClipPackage>;
  getById(id: string): Promise<ClipPackage | null>;
  listByLanguage(options: ListClipPackagesOptions): Promise<ClipPackage[]>;
  update(id: string, updates: Partial<Omit<ClipPackage, "id" | "createdAt">>): Promise<ClipPackage | null>;
  delete(id: string): Promise<boolean>;
}

const PK_PREFIX = "CLIP#";
const SK = "METADATA";

function toItem(pkg: ClipPackage): Record<string, unknown> {
  return {
    PK: `${PK_PREFIX}${pkg.id}`,
    SK,
    id: pkg.id,
    thumbnailUrl: pkg.thumbnailUrl,
    mediaUrl: pkg.mediaUrl,
    characterName: pkg.characterName,
    usedWords: pkg.usedWords,
    caption: pkg.caption,
    language: (pkg.language || "").trim().toLowerCase(),
    languageOriginal: pkg.language,
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  };
}

function fromItem(item: Record<string, unknown>): ClipPackage {
  const usedWords = (item.usedWords as UsedWord[] | undefined) ?? [];
  return {
    id: item.id as string,
    thumbnailUrl: (item.thumbnailUrl as string) ?? "",
    mediaUrl: (item.mediaUrl as string) ?? "",
    characterName: typeof item.characterName === "string" ? item.characterName : undefined,
    usedWords: Array.isArray(usedWords) ? usedWords : [],
    caption: (item.caption as string) ?? "",
    language: (item.languageOriginal as string) ?? (item.language as string) ?? "",
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

export class DynamoDBClipPackageRepository implements ClipPackageRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) throw new Error("CLIP_PACKAGES_TABLE is not set");
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async create(pkg: Omit<ClipPackage, "createdAt" | "updatedAt">): Promise<ClipPackage> {
    const now = new Date().toISOString();
    const full: ClipPackage = {
      ...pkg,
      createdAt: now,
      updatedAt: now,
    };
    const item = toItem(full);
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );
    return full;
  }

  async getById(id: string): Promise<ClipPackage | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `${PK_PREFIX}${id}`, SK },
      })
    );
    if (!result.Item) return null;
    return fromItem(result.Item as Record<string, unknown>);
  }

  async listByLanguage(options: ListClipPackagesOptions): Promise<ClipPackage[]> {
    const { language, characterName, limit = 500 } = options;
    const langNorm = (language || "").trim().toLowerCase();
    const expressionAttributeNames: Record<string, string> = { "#lang": "language" };
    const expressionAttributeValues: Record<string, string> = { ":lang": langNorm };
    if (characterName && characterName.trim()) {
      expressionAttributeNames["#char"] = "characterName";
      expressionAttributeValues[":char"] = characterName.trim();
    }
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "language-createdAt-index",
        KeyConditionExpression: "#lang = :lang",
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ...(characterName && characterName.trim() ? { FilterExpression: "#char = :char" } : {}),
        Limit: limit,
      })
    );
    const items = (result.Items ?? []) as Record<string, unknown>[];
    return items.map((i) => fromItem(i));
  }

  async update(id: string, updates: Partial<Omit<ClipPackage, "id" | "createdAt">>): Promise<ClipPackage | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: ClipPackage = {
      ...existing,
      ...updates,
      updatedAt: now,
    };
    if (updates.language !== undefined) {
      (updated as Record<string, unknown>).language = (updates.language || "").trim().toLowerCase();
      (updated as Record<string, unknown>).languageOriginal = updates.language;
    }
    const item = toItem(updated);
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: `${PK_PREFIX}${id}`, SK },
      })
    );
    return true;
  }
}
