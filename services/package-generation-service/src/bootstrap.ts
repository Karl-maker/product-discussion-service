import { GenerationStateRepository } from "./infrastructure/repositories/generation-state.repository";
import { AnalysisResultRepository } from "./infrastructure/repositories/analysis-result.repository";
import { UserPackageRepository } from "./infrastructure/repositories/user-package.repository";
import { PackageGenerationOpenAIClient } from "./infrastructure/openai.client";
import { SNSPackageGeneratedNotifier } from "./infrastructure/package-generated.notifier";
import { ProcessSessionUseCase } from "./app/usecases/process.session.usecase";

export function bootstrap() {
  const stateTable = process.env.GENERATION_STATE_TABLE;
  const analysisTable = process.env.ANALYSIS_RESULTS_TABLE;
  const packagesTable = process.env.CONVERSATION_PACKAGES_TABLE;
  const topicArn = process.env.PACKAGE_GENERATED_TOPIC_ARN;
  const projectName = process.env.PROJECT_NAME ?? "eislett-education";
  const environment = process.env.ENVIRONMENT ?? "dev";

  if (!stateTable || !analysisTable || !packagesTable) {
    throw new Error(
      "GENERATION_STATE_TABLE, ANALYSIS_RESULTS_TABLE, and CONVERSATION_PACKAGES_TABLE must be set"
    );
  }

  const stateRepo = new GenerationStateRepository(stateTable);
  const analysisRepo = new AnalysisResultRepository(analysisTable);
  const packageRepo = new UserPackageRepository(packagesTable);
  const openai = new PackageGenerationOpenAIClient();
  const packageGeneratedNotifier = topicArn ? new SNSPackageGeneratedNotifier(topicArn) : undefined;

  let openaiInit: Promise<void> | null = null;
  const ensureOpenAI = () => {
    if (!openaiInit) openaiInit = openai.initialize(projectName, environment);
    return openaiInit;
  };

  const processSessionUseCase = new ProcessSessionUseCase(
    stateRepo,
    analysisRepo,
    packageRepo,
    openai,
    packageGeneratedNotifier
  );

  return { processSessionUseCase, ensureOpenAI };
}
