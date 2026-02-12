import { ConversationPackageRepository } from "./infrastructure/repositories/conversation-package.repository";
import { AnalysisResultRepository } from "./infrastructure/repositories/analysis-result.repository";
import { OpenAIClient } from "./infrastructure/openai.client";
import { CreatePackageUseCase } from "./app/usecases/create.package.usecase";
import { GetPackageUseCase } from "./app/usecases/get.package.usecase";
import { ListPackagesUseCase } from "./app/usecases/list.packages.usecase";
import { UpdatePackageUseCase } from "./app/usecases/update.package.usecase";
import { DeletePackageUseCase } from "./app/usecases/delete.package.usecase";
import { AnalyzeTranscriptUseCase } from "./app/usecases/analyze.transcript.usecase";
import { ListAnalysisResultsUseCase } from "./app/usecases/list.analysis.results.usecase";
import { CreatePackageController } from "./app/controllers/create.package.controller";
import { GetPackageController } from "./app/controllers/get.package.controller";
import { ListPackagesController } from "./app/controllers/list.packages.controller";
import { ListMyPackagesController } from "./app/controllers/list.my.packages.controller";
import { UpdatePackageController } from "./app/controllers/update.package.controller";
import { DeletePackageController } from "./app/controllers/delete.package.controller";
import { AnalyzeTranscriptController } from "./app/controllers/analyze.transcript.controller";
import { ListAnalysisResultsController } from "./app/controllers/list.analysis.results.controller";

export function bootstrap() {
  const tableName = process.env.CONVERSATION_PACKAGES_TABLE;
  if (!tableName) {
    throw new Error("CONVERSATION_PACKAGES_TABLE environment variable is not set");
  }

  const analysisTableName = process.env.ANALYSIS_RESULTS_TABLE;
  if (!analysisTableName) {
    throw new Error("ANALYSIS_RESULTS_TABLE environment variable is not set");
  }

  const projectName = process.env.PROJECT_NAME ?? "eislett-education";
  const environment = process.env.ENVIRONMENT ?? "dev";

  const repository = new ConversationPackageRepository(tableName);
  const analysisRepository = new AnalysisResultRepository(analysisTableName);
  const openAIClient = new OpenAIClient();

  let openAIInitPromise: Promise<void> | null = null;
  const ensureOpenAI = async () => {
    if (!openAIInitPromise) {
      openAIInitPromise = openAIClient.initialize(projectName, environment);
    }
    return openAIInitPromise;
  };
  (global as unknown as { __conversationPackageServiceEnsureOpenAI?: () => Promise<void> }).__conversationPackageServiceEnsureOpenAI = ensureOpenAI;

  const createPackageUseCase = new CreatePackageUseCase(repository);
  const getPackageUseCase = new GetPackageUseCase(repository);
  const listPackagesUseCase = new ListPackagesUseCase(repository);
  const updatePackageUseCase = new UpdatePackageUseCase(repository);
  const deletePackageUseCase = new DeletePackageUseCase(repository);
  const analyzeTranscriptUseCase = new AnalyzeTranscriptUseCase(openAIClient, analysisRepository);
  const listAnalysisResultsUseCase = new ListAnalysisResultsUseCase(analysisRepository);

  const createPackageController = new CreatePackageController(createPackageUseCase);
  const getPackageController = new GetPackageController(getPackageUseCase);
  const listPackagesController = new ListPackagesController(listPackagesUseCase);
  const listMyPackagesController = new ListMyPackagesController(listPackagesUseCase);
  const updatePackageController = new UpdatePackageController(updatePackageUseCase);
  const deletePackageController = new DeletePackageController(deletePackageUseCase);
  const analyzeTranscriptController = new AnalyzeTranscriptController(analyzeTranscriptUseCase);
  const listAnalysisResultsController = new ListAnalysisResultsController(listAnalysisResultsUseCase);

  return {
    createPackageController,
    getPackageController,
    listPackagesController,
    listMyPackagesController,
    updatePackageController,
    deletePackageController,
    analyzeTranscriptController,
    listAnalysisResultsController,
  };
}
