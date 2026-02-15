import type { ScheduledHandler } from "aws-lambda";
import { LatestPackagesRepository } from "../infrastructure/repositories/latest-packages.repository";
import { NoticeSentRepository } from "../infrastructure/repositories/notice-sent.repository";
import { AnalysisFeedbackRepository } from "../infrastructure/repositories/analysis-feedback.repository";
import { EmailQueueClient } from "../infrastructure/email-queue.client";
import { SendNoticesUseCase } from "../app/send.notices.usecase";

function getUseCase(): SendNoticesUseCase {
  const packagesTable = process.env.CONVERSATION_PACKAGES_TABLE ?? "";
  const noticeSentTable = process.env.NOTICE_SENT_TABLE ?? "";
  const analysisResultsTable = process.env.ANALYSIS_RESULTS_TABLE ?? "";
  const emailQueueUrl = process.env.EMAIL_SERVICE_QUEUE_URL ?? "";
  const appBaseUrl = process.env.APP_BASE_URL ?? "https://app.wittytalk.ai";

  if (!packagesTable || !noticeSentTable || !analysisResultsTable) {
    throw new Error(
      "Missing required env: CONVERSATION_PACKAGES_TABLE, NOTICE_SENT_TABLE, and ANALYSIS_RESULTS_TABLE must be set"
    );
  }
  if (!emailQueueUrl) {
    throw new Error(
      "EMAIL_SERVICE_QUEUE_URL is not set. Set it in Terraform (or ensure the email-service queue exists and is named {project_name}-{environment}-email-service-queue)."
    );
  }

  return new SendNoticesUseCase(
    new LatestPackagesRepository(packagesTable),
    new NoticeSentRepository(noticeSentTable),
    new AnalysisFeedbackRepository(analysisResultsTable),
    new EmailQueueClient(emailQueueUrl, appBaseUrl)
  );
}

export const scheduleHandler: ScheduledHandler = async () => {
  try {
    const useCase = getUseCase();
    const { sent, skipped } = await useCase.execute();
    console.log(`Package notices: sent=${sent}, skipped=${skipped}`);
  } catch (err) {
    console.error("Package notice run failed:", err);
    throw err;
  }
};
