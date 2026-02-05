import type { RequestContext } from "../../handler/api-gateway/types";
import type { ConversationTarget } from "../../domain/types/package.types";
import { AnalyzeTranscriptUseCase } from "../usecases/analyze.transcript.usecase";
import { AuthenticationError } from "@libs/domain";

export class AnalyzeTranscriptController {
  constructor(private readonly useCase: AnalyzeTranscriptUseCase) {}

  handle = async (req: RequestContext) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AuthenticationError("User authentication required");
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const {
      conversationPackageId,
      topicKey,
      targets,
      transcript,
      targetLanguage,
    } = body;

    if (!conversationPackageId || typeof conversationPackageId !== "string") {
      throw new Error("conversationPackageId is required");
    }
    if (!topicKey || typeof topicKey !== "string") {
      throw new Error("topicKey is required");
    }
    if (!Array.isArray(targets)) {
      throw new Error("targets must be an array");
    }
    if (typeof transcript !== "string") {
      throw new Error("transcript is required and must be a string");
    }

    const targetList = targets as unknown[];
    const validTargets: ConversationTarget[] = [];
    for (let i = 0; i < targetList.length; i++) {
      const t = targetList[i];
      if (t === null || typeof t !== "object") {
        throw new Error(`targets[${i}] must be an object with key, description, check`);
      }
      const row = t as Record<string, unknown>;
      if (typeof row.key !== "string" || typeof row.description !== "string" || typeof row.check !== "string") {
        throw new Error(`targets[${i}] must have key, description, and check (strings); amount (number) is optional`);
      }
      validTargets.push({
        key: row.key,
        description: row.description,
        check: row.check,
        amount: typeof row.amount === "number" ? row.amount : undefined,
      });
    }

    const targetLanguageStr =
      targetLanguage === undefined || targetLanguage === null
        ? undefined
        : typeof targetLanguage === "string"
          ? targetLanguage.trim() || undefined
          : undefined;

    return this.useCase.execute({
      userId,
      conversationPackageId,
      topicKey,
      targets: validTargets,
      transcript,
      targetLanguage: targetLanguageStr,
    });
  };
}
