import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  ConversationPackage,
  ConversationPackageFilters,
  PackageConversation,
  PackageNotes,
} from "../../domain/types/package.types";

export interface Pagination {
  pageNumber: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

/** When set, list includes packages where userId matches. When unset, list excludes all packages that have userId. */
/** When onlyUserPackages is true, list returns only packages where userId === currentUserId (currentUserId required). */
export interface ListOptions {
  currentUserId?: string;
  onlyUserPackages?: boolean;
}

export class ConversationPackageRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("CONVERSATION_PACKAGES_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async save(pkg: ConversationPackage): Promise<void> {
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
    };
    if (pkg.notes !== undefined) item.notes = pkg.notes;
    if (pkg.userId !== undefined) item.userId = pkg.userId;
    if (pkg.language !== undefined) {
      item.targetLanguage = pkg.language;
      item.targetLanguageNorm = (pkg.language || "").trim().toLowerCase();
    }
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      })
    );
  }

  async findById(id: string): Promise<ConversationPackage | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `PACKAGE#${id}`,
          SK: `METADATA#${id}`,
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.mapToDomain(result.Item);
  }

  async list(
    filters: ConversationPackageFilters,
    pagination: Pagination,
    options?: ListOptions
  ): Promise<PaginatedResult<ConversationPackage>> {
    const pageSize = pagination.pageSize;
    const pageNumber = pagination.pageNumber;
    const currentUserId = options?.currentUserId;
    const onlyUserPackages = options?.onlyUserPackages === true;

    if (pageNumber < 1) {
      throw new Error("pageNumber must be >= 1");
    }

    const filterExpressions: string[] = [];
    const expressionAttributeValues: Record<string, unknown> = {};
    const expressionAttributeNames: Record<string, string> = {};

    if (filters.category) {
      filterExpressions.push("category = :category");
      expressionAttributeValues[":category"] = filters.category;
    }
    if (filters.language) {
      const langNorm = filters.language.trim().toLowerCase();
      const langExact = filters.language.trim();
      expressionAttributeNames["#tl"] = "targetLanguage";
      expressionAttributeNames["#tlNorm"] = "targetLanguageNorm";
      expressionAttributeValues[":norm"] = langNorm;
      expressionAttributeValues[":lang"] = langExact;
      filterExpressions.push("(#tlNorm = :norm OR (attribute_not_exists(#tlNorm) AND #tl = :lang))");
    }

    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
        ...(filterExpressions.length > 0 && {
          FilterExpression: filterExpressions.join(" AND "),
          ExpressionAttributeValues: expressionAttributeValues,
          ...(Object.keys(expressionAttributeNames).length > 0 && { ExpressionAttributeNames: expressionAttributeNames }),
        }),
        Limit: pageSize * pageNumber * 3,
      })
    );
    let items = (result.Items || []).map((item) => this.mapToDomain(item));

    // User-specific packages: exclude unless JWT present and owner; if onlyUserPackages, keep only mine
    items = items.filter((p) => {
      if (onlyUserPackages) return currentUserId !== undefined && p.userId === currentUserId;
      if (p.userId) return currentUserId !== undefined && p.userId === currentUserId;
      return true;
    });

    items.sort((a, b) => {
      const t1 = new Date(a.createdAt).getTime();
      const t2 = new Date(b.createdAt).getTime();
      return t1 - t2;
    });

    const startIndex = (pageNumber - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedItems = items.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      total: items.length,
      hasMore: endIndex < items.length,
    };
  }

  async delete(id: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `PACKAGE#${id}`,
          SK: `METADATA#${id}`,
        },
      })
    );
  }

  private mapToDomain(item: Record<string, unknown>): ConversationPackage {
    const pkg: ConversationPackage = {
      id: item.id as string,
      name: item.name as string,
      description: item.description as string | undefined,
      category: item.category as string,
      tags: (item.tags as string[]) || [],
      conversations: (item.conversations as PackageConversation[]) || [],
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    };
    if (item.notes != null && typeof item.notes === "object")
      pkg.notes = item.notes as PackageNotes;
    if (typeof item.userId === "string") pkg.userId = item.userId;
    const langVal = item.targetLanguage ?? item.lang ?? item.language;
    if (typeof langVal === "string") pkg.language = langVal;
    return pkg;
  }
}
