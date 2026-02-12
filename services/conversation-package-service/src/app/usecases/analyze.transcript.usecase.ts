import { OpenAIClient } from "../../infrastructure/openai.client";
import { AnalysisResultRepository } from "../../infrastructure/repositories/analysis-result.repository";
import type { ConversationTarget, TargetLanguageWord } from "../../domain/types/package.types";
import type { TranscriptAnalysisResult } from "../../domain/types/package.types";

export interface AnalyzeTranscriptInput {
  userId: string;
  conversationPackageId: string;
  topicKey: string;
  targets: ConversationTarget[];
  transcript: string;
  /** When set, analysis includes words the user said in this language (word, pronunciation, meaning). */
  targetLanguage?: string;
}

export interface AnalyzeTranscriptOutput {
  feedback: TranscriptAnalysisResult["feedback"];
  /** Present when targetLanguage was provided. */
  wordsUsed?: TargetLanguageWord[];
  saved: boolean;
}

export class AnalyzeTranscriptUseCase {
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly analysisResultRepository: AnalysisResultRepository
  ) {}

  async execute(input: AnalyzeTranscriptInput): Promise<AnalyzeTranscriptOutput> {
    const ensureInit = (global as unknown as { __conversationPackageServiceEnsureOpenAI?: () => Promise<void> }).__conversationPackageServiceEnsureOpenAI;
    if (ensureInit) {
      await ensureInit();
    }

    const result = await this.openAIClient.analyzeTranscript({
      targets: input.targets,
      transcript: input.transcript,
      targetLanguage: input.targetLanguage,
    });

    const now = new Date().toISOString();
    const createdAtMs = new Date(now).getTime();
    const ninetyDaysSeconds = 90 * 24 * 60 * 60;
    const ttl = Math.floor(createdAtMs / 1000) + ninetyDaysSeconds;

    const hitKeys = new Set(result.feedback.flatMap((f) => f.targets));
    const targetsHit = input.targets.filter((t) => hitKeys.has(t.key));
    const targetsMissed = input.targets.filter((t) => !hitKeys.has(t.key));

    await this.analysisResultRepository.save({
      userId: input.userId,
      conversationPackageId: input.conversationPackageId,
      topicKey: input.topicKey,
      result,
      targetLanguage: input.targetLanguage,
      targetsHit,
      targetsMissed,
      createdAt: now,
      ttl,
    });

    return {
      feedback: result.feedback,
      wordsUsed: result.wordsUsed,
      saved: true,
    };
  }
}
