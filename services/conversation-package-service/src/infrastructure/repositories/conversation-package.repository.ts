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
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
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
        },
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
    pagination: Pagination
  ): Promise<PaginatedResult<ConversationPackage>> {
    const pageSize = pagination.pageSize;
    const pageNumber = pagination.pageNumber;

    if (pageNumber < 1) {
      throw new Error("pageNumber must be >= 1");
    }

    const filterExpressions: string[] = [];
    const expressionAttributeValues: Record<string, unknown> = {};

    if (filters.category) {
      filterExpressions.push("category = :category");
      expressionAttributeValues[":category"] = filters.category;
    }

    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
        ...(filterExpressions.length > 0 && {
          FilterExpression: filterExpressions.join(" AND "),
          ExpressionAttributeValues: expressionAttributeValues,
        }),
        Limit: pageSize * pageNumber,
      })
    );

    const items = (result.Items || []).map((item) => this.mapToDomain(item));

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
    return {
      id: item.id as string,
      name: item.name as string,
      description: item.description as string | undefined,
      category: item.category as string,
      tags: (item.tags as string[]) || [],
      conversations: (item.conversations as PackageConversation[]) || [],
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    };
  }
}
