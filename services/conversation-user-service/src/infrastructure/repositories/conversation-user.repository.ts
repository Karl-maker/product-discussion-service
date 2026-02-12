import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ConversationUser } from "../../domain/types/user.types";

export class ConversationUserRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("CONVERSATION_USERS_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async save(user: ConversationUser): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${user.userId}`,
          SK: "PROFILE",
          userId: user.userId,
          language: user.language,
          targetLanguage: user.targetLanguage,
          initialFluency: user.initialFluency,
          profession: user.profession,
          timezone: user.timezone,
          country: user.country,
          purposeOfUsage: user.purposeOfUsage,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      })
    );
  }

  async findByUserId(userId: string): Promise<ConversationUser | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: "PROFILE",
        },
      })
    );

    if (!result.Item) {
      return null;
    }

    return this.mapToDomain(result.Item);
  }

  private mapToDomain(item: Record<string, unknown>): ConversationUser {
    return {
      userId: item.userId as string,
      language: item.language as string | undefined,
      targetLanguage: item.targetLanguage as string | undefined,
      initialFluency: item.initialFluency as string | undefined,
      profession: item.profession as string | undefined,
      timezone: item.timezone as string | undefined,
      country: item.country as string | undefined,
      purposeOfUsage: item.purposeOfUsage as string | undefined,
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    };
  }
}
