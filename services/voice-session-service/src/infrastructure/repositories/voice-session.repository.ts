import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

export interface VoiceSessionRecord {
  sessionId: string;
  userId?: string;
  targetLanguage?: string;
  createdAt: string;
  expiresAt: string;
  ttl: number;
}

export class VoiceSessionRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) {
      throw new Error("VOICE_SESSIONS_TABLE environment variable is not set");
    }
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async save(record: VoiceSessionRecord): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `SESSION#${record.sessionId}`,
          SK: `METADATA#${record.sessionId}`,
          sessionId: record.sessionId,
          userId: record.userId,
          targetLanguage: record.targetLanguage,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          ttl: record.ttl,
        },
      })
    );
  }
}
