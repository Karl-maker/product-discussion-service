import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Optional: resolve userId -> email. Table expected to have PK = userId (or USER#userId) and attribute "email".
 * If USER_EMAIL_TABLE is not set, getEmail returns null and we skip sending for that user.
 */
export class UserEmailRepository {
  private readonly tableName: string | null;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string | undefined) {
    this.tableName = tableName ?? null;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getEmail(userId: string): Promise<string | null> {
    if (!this.tableName) return null;
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `USER#${userId}`, SK: "PROFILE" },
      })
    );
    if (!result.Item) return null;
    const email = result.Item.email ?? result.Item.emailAddress;
    return typeof email === "string" ? email : null;
  }
}
