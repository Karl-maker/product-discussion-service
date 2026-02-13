import type { SQSEvent } from "aws-lambda";
import { bootstrap } from "../bootstrap";
import type { SessionMessage } from "../domain/types";

function parseMessage(body: string): SessionMessage | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const sessionId = parsed.sessionId;
    if (typeof sessionId !== "string") return null;
    const userId = parsed.userId;
    // Prefer targetLanguage (voice-session sends this); fallback for legacy or alternate senders
    const targetLanguage =
      typeof parsed.targetLanguage === "string"
        ? parsed.targetLanguage
        : typeof parsed.target_language === "string"
          ? parsed.target_language
          : typeof parsed.language === "string"
            ? parsed.language
            : undefined;
    return {
      sessionId,
      userId: typeof userId === "string" ? userId : undefined,
      targetLanguage: targetLanguage && targetLanguage.length > 0 ? targetLanguage : undefined,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      expiresAt: typeof parsed.expiresAt === "string" ? parsed.expiresAt : undefined,
      ttl: typeof parsed.ttl === "number" ? parsed.ttl : undefined,
    };
  } catch {
    return null;
  }
}

export async function sqsHandler(event: SQSEvent): Promise<{ batchItemFailures: Array<{ itemIdentifier: string }> }> {
  const { processSessionUseCase, ensureOpenAI } = bootstrap();
  await ensureOpenAI();

  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records) {
    const message = parseMessage(record.body);
    if (!message) {
      console.warn("Package generation: invalid or missing sessionId in SQS message", { messageId: record.messageId, bodyPreview: record.body?.substring?.(0, 200) });
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

    try {
      await processSessionUseCase.execute({ message });
    } catch (err) {
      console.error("Process session failed:", record.messageId, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
