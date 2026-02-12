import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

export class GenerationStateRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("GENERATION_STATE_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async getLastProcessedAt(userId: string, language: string): Promise<string | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `LANGUAGE#${language}`,
        },
      })
    );
    const at = result.Item?.lastProcessedAt;
    return typeof at === "string" ? at : null;
  }

  async setLastProcessedAt(userId: string, language: string, at: string): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${userId}`,
          SK: `LANGUAGE#${language}`,
          lastProcessedAt: at,
        },
      })
    );
  }
}
