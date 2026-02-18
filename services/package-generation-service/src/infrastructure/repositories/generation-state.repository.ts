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
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getLastProcessedAt(userId: string, targetLanguage: string): Promise<string | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `LANGUAGE#${targetLanguage}`,
        },
      })
    );
    const at = result.Item?.lastProcessedAt;
    return typeof at === "string" ? at : null;
  }

  async setLastProcessedAt(userId: string, targetLanguage: string, at: string): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${userId}`,
          SK: `LANGUAGE#${targetLanguage}`,
          lastProcessedAt: at,
        },
      })
    );
  }

  /** Last calendar day (UTC) we generated a lesson for this user. Used for 1-lesson-per-user-per-day limit. */
  async getLastLessonDate(userId: string): Promise<string | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: "LAST_LESSON_DAY",
        },
      })
    );
    const date = result.Item?.lastLessonDate;
    return typeof date === "string" ? date : null;
  }

  /** Set the last calendar day (UTC) we generated a lesson for this user. */
  async setLastLessonDate(userId: string, date: string): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `USER#${userId}`,
          SK: "LAST_LESSON_DAY",
          lastLessonDate: date,
        },
      })
    );
  }
}
