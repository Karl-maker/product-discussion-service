import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ClipAttempt, ClipSnapshot, ClipLike } from "../../domain/types/clip-result.types";

const USER_PK = "USER#";
const ATTEMPT_SK_PREFIX = "ATTEMPT#";
const CLIP_PK = "CLIP#";
const SNAPSHOT_SK = "SNAPSHOT";
const LIKE_SK_PREFIX = "LIKE#";

function attemptSk(clipId: string, attemptedAt: string): string {
  return `${ATTEMPT_SK_PREFIX}${clipId}#${attemptedAt}`;
}

function likeSk(clipId: string): string {
  return `${LIKE_SK_PREFIX}${clipId}`;
}

export interface ClipResultsRepository {
  putAttempt(attempt: ClipAttempt): Promise<void>;
  getLatestAttempt(userId: string, clipId: string): Promise<ClipAttempt | null>;
  getSnapshot(clipId: string): Promise<ClipSnapshot | null>;
  updateSnapshotAverage(clipId: string, newScore: number, previousTotalAttempts: number, previousAverage: number): Promise<void>;
  putLike(like: ClipLike): Promise<boolean>;
  deleteLike(userId: string, clipId: string): Promise<boolean>;
  getUserLikes(userId: string): Promise<ClipLike[]>;
  getLike(userId: string, clipId: string): Promise<ClipLike | null>;
  incrementSnapshotLikes(clipId: string, delta: number): Promise<void>;
}

export class DynamoDBClipResultsRepository implements ClipResultsRepository {
  private readonly tableName: string;
  private readonly client: DynamoDBDocumentClient;

  constructor(tableName: string) {
    if (!tableName) throw new Error("CLIP_RESULTS_TABLE is not set");
    this.tableName = tableName;
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async putAttempt(attempt: ClipAttempt): Promise<void> {
    const score = Math.max(0, Math.min(1, attempt.score));
    const attemptedAt = attempt.attemptedAt || new Date().toISOString();
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `${USER_PK}${attempt.userId}`,
          SK: attemptSk(attempt.clipId, attemptedAt),
          userId: attempt.userId,
          clipId: attempt.clipId,
          score,
          attemptedAt,
        },
      })
    );
  }

  async getLatestAttempt(userId: string, clipId: string): Promise<ClipAttempt | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `${USER_PK}${userId}`,
          ":sk": `${ATTEMPT_SK_PREFIX}${clipId}#`,
        },
        ScanIndexForward: false,
        Limit: 1,
      })
    );
    const item = result.Items?.[0] as Record<string, unknown> | undefined;
    if (!item) return null;
    return {
      userId: item.userId as string,
      clipId: item.clipId as string,
      score: Number(item.score),
      attemptedAt: item.attemptedAt as string,
    };
  }

  async getSnapshot(clipId: string): Promise<ClipSnapshot | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `${CLIP_PK}${clipId}`, SK: SNAPSHOT_SK },
      })
    );
    const item = result.Item as Record<string, unknown> | undefined;
    if (!item) return null;
    return {
      clipId: item.clipId as string,
      averageScore: Number(item.averageScore ?? 0),
      totalAttempts: Number(item.totalAttempts ?? 0),
      totalLikes: Number(item.totalLikes ?? 0),
      updatedAt: item.updatedAt as string,
    };
  }

  async updateSnapshotAverage(
    clipId: string,
    newScore: number,
    previousTotalAttempts: number,
    previousAverage: number
  ): Promise<void> {
    const snapshot = await this.getSnapshot(clipId);
    const totalAttempts = previousTotalAttempts + 1;
    const averageScore = (previousAverage * previousTotalAttempts + newScore) / totalAttempts;
    const now = new Date().toISOString();
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `${CLIP_PK}${clipId}`,
          SK: SNAPSHOT_SK,
          clipId,
          averageScore: Math.round(averageScore * 10000) / 10000,
          totalAttempts,
          totalLikes: snapshot?.totalLikes ?? 0,
          updatedAt: now,
        },
      })
    );
  }

  async putLike(like: ClipLike): Promise<boolean> {
    const likedAt = like.likedAt || new Date().toISOString();
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: `${USER_PK}${like.userId}`,
            SK: likeSk(like.clipId),
            userId: like.userId,
            clipId: like.clipId,
            likedAt,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        })
      );
      return true;
    } catch (e: unknown) {
      if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "ConditionalCheckFailedException") {
        return false;
      }
      throw e;
    }
  }

  async deleteLike(userId: string, clipId: string): Promise<boolean> {
    const existing = await this.getLike(userId, clipId);
    if (!existing) return false;
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: `${USER_PK}${userId}`, SK: likeSk(clipId) },
      })
    );
    return true;
  }

  async getUserLikes(userId: string): Promise<ClipLike[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `${USER_PK}${userId}`,
          ":sk": LIKE_SK_PREFIX,
        },
      })
    );
    const items = (result.Items ?? []) as Record<string, unknown>[];
    return items.map((item) => ({
      userId: item.userId as string,
      clipId: item.clipId as string,
      likedAt: item.likedAt as string,
    }));
  }

  async getLike(userId: string, clipId: string): Promise<ClipLike | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: `${USER_PK}${userId}`, SK: likeSk(clipId) },
      })
    );
    const item = result.Item as Record<string, unknown> | undefined;
    if (!item) return null;
    return {
      userId: item.userId as string,
      clipId: item.clipId as string,
      likedAt: item.likedAt as string,
    };
  }

  async incrementSnapshotLikes(clipId: string, delta: number): Promise<void> {
    const snapshot = await this.getSnapshot(clipId);
    const now = new Date().toISOString();
    const totalLikes = Math.max(0, (snapshot?.totalLikes ?? 0) + delta);
    const totalAttempts = snapshot?.totalAttempts ?? 0;
    const averageScore = snapshot?.averageScore ?? 0;
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `${CLIP_PK}${clipId}`,
          SK: SNAPSHOT_SK,
          clipId,
          averageScore,
          totalAttempts,
          totalLikes,
          updatedAt: now,
        },
      })
    );
  }
}
