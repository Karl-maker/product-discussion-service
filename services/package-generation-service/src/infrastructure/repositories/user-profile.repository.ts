import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export interface UserProfileContext {
  profession?: string;
  initialFluency?: string;
  purposeOfUsage?: string;
}

export class UserProfileRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    this.tableName = tableName ?? "";
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getProfileContext(userId: string): Promise<UserProfileContext | null> {
    if (!this.tableName || !userId) return null;
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: "PROFILE",
        },
        ProjectionExpression: "profession, initialFluency, purposeOfUsage",
      })
    );

    if (!result.Item) return null;

    const item = result.Item as Record<string, unknown>;
    const profession = typeof item.profession === "string" ? item.profession.trim() || undefined : undefined;
    const initialFluency = typeof item.initialFluency === "string" ? item.initialFluency.trim() || undefined : undefined;
    const purposeOfUsage = typeof item.purposeOfUsage === "string" ? item.purposeOfUsage.trim() || undefined : undefined;

    if (!profession && !initialFluency && !purposeOfUsage) return null;

    return { profession, initialFluency, purposeOfUsage };
  }
}
