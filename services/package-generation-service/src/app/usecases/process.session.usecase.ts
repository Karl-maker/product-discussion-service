import type { SessionMessage } from "../../domain/types";
import { GenerationStateRepository } from "../../infrastructure/repositories/generation-state.repository";
import { AnalysisResultRepository } from "../../infrastructure/repositories/analysis-result.repository";
import { UserPackageRepository, type StoredPackage } from "../../infrastructure/repositories/user-package.repository";
import type { UserProfileRepository } from "../../infrastructure/repositories/user-profile.repository";
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
    private readonly profileRepo: UserProfileRepository,
    private readonly openai: PackageGenerationOpenAIClient,
    private readonly packageGeneratedNotifier?: PackageGeneratedNotifier
  ) {}

  async execute(input: ProcessSessionInput): Promise<void> {
    const { message } = input;
    const userId = message.userId;
    const targetLanguage = (message.targetLanguage ?? "").trim().toLowerCase();

    if (!userId || !targetLanguage) {
      if (!userId) {
        console.warn("Package generation: skipping session – missing userId", { sessionId: message.sessionId });
      } else {
        console.warn("Package generation: skipping session – missing or empty targetLanguage", { sessionId: message.sessionId, userId });
      }
      return;
    }

    const lastProcessedAt = await this.stateRepo.getLastProcessedAt(userId, targetLanguage);
    if (lastProcessedAt) {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (new Date(lastProcessedAt).getTime() > oneHourAgo) {
        console.info("Package generation: skipping – same user+targetLanguage processed within last hour", { userId, targetLanguage, lastProcessedAt });
        return;
      }
    }
    const allResults = await this.analysisRepo.listByUserId(userId, 500);
    const resultsSinceLast = lastProcessedAt
      ? allResults.filter((r) => r.createdAt > lastProcessedAt)
      : allResults;
    const forTargetLanguage = resultsSinceLast.filter(
      (r) => !r.targetLanguage || r.targetLanguage.toLowerCase() === targetLanguage
    );

    const existingPackage = await this.packageRepo.findByUserIdAndLanguage(userId, targetLanguage);
    const userContext = await this.profileRepo.getProfileContext(userId);

    const generated = await this.openai.generatePackage({
      targetLanguage,
      existingPackage,
      analysisResults: forTargetLanguage,
      userContext: userContext ?? undefined,
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
      targetLanguage,
    };

    await this.packageRepo.save(toSave);
    await this.stateRepo.setLastProcessedAt(userId, targetLanguage, now);

    if (this.packageGeneratedNotifier) {
      await this.packageGeneratedNotifier.notify(toSave, !!existingPackage);
    }
  }
}
