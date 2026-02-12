import type { SessionMessage } from "../../domain/types";
import { GenerationStateRepository } from "../../infrastructure/repositories/generation-state.repository";
import { AnalysisResultRepository } from "../../infrastructure/repositories/analysis-result.repository";
import { UserPackageRepository, type StoredPackage } from "../../infrastructure/repositories/user-package.repository";
import { PackageGenerationOpenAIClient } from "../../infrastructure/openai.client";
import type { PackageGeneratedNotifier } from "../../infrastructure/package-generated.notifier";

export interface ProcessSessionInput {
  message: SessionMessage;
}

export class ProcessSessionUseCase {
  constructor(
    private readonly stateRepo: GenerationStateRepository,
    private readonly analysisRepo: AnalysisResultRepository,
    private readonly packageRepo: UserPackageRepository,
    private readonly openai: PackageGenerationOpenAIClient,
    private readonly packageGeneratedNotifier?: PackageGeneratedNotifier
  ) {}

  async execute(input: ProcessSessionInput): Promise<void> {
    const { message } = input;
    const userId = message.userId;
    const language = (message.targetLanguage ?? "").trim().toLowerCase();

    if (!userId || !language) {
      return;
    }

    const lastProcessedAt = await this.stateRepo.getLastProcessedAt(userId, language);
    if (lastProcessedAt) {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (new Date(lastProcessedAt).getTime() > oneHourAgo) {
        return;
      }
    }
    const allResults = await this.analysisRepo.listByUserId(userId, 100);
    const resultsSinceLast = lastProcessedAt
      ? allResults.filter((r) => r.createdAt > lastProcessedAt)
      : allResults;
    const forLanguage = resultsSinceLast.filter(
      (r) => !r.targetLanguage || r.targetLanguage.toLowerCase() === language
    );

    const existingPackage = await this.packageRepo.findByUserIdAndLanguage(userId, language);

    const generated = await this.openai.generatePackage({
      language,
      existingPackage,
      analysisResults: forLanguage,
    });

    const now = new Date().toISOString();
    const id = existingPackage
      ? existingPackage.id
      : `pkg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const createdAt = existingPackage ? existingPackage.createdAt : now;

    const toSave: StoredPackage = {
      id,
      name: generated.name,
      description: generated.description,
      category: generated.category,
      tags: generated.tags,
      conversations: generated.conversations,
      createdAt,
      updatedAt: now,
      notes: generated.notes,
      userId,
      language,
    };

    await this.packageRepo.save(toSave);
    await this.stateRepo.setLastProcessedAt(userId, language, now);

    if (this.packageGeneratedNotifier) {
      await this.packageGeneratedNotifier.notify(toSave, !!existingPackage);
    }
  }
}
