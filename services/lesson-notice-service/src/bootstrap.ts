import { SendLessonNoticesUseCase } from "./app/send-lesson-notices.usecase";
import { PackagesRepository } from "./infrastructure/packages.repository";
import { NoticeSentRepository } from "./infrastructure/notice-sent.repository";
import { UserEmailRepository } from "./infrastructure/user-email.repository";
import { EmailQueueClient } from "./infrastructure/email-queue.client";
import { AnalysisFeedbackRepository } from "./infrastructure/analysis-feedback.repository";

export function bootstrap() {
  const packagesTable = process.env.CONVERSATION_PACKAGES_TABLE;
  const noticeSentTable = process.env.NOTICE_SENT_TABLE;
  const emailQueueUrl = process.env.EMAIL_QUEUE_URL;
  const userEmailTable = process.env.USER_EMAIL_TABLE;
  const analysisResultsTable = process.env.ANALYSIS_RESULTS_TABLE;
  const lessonBaseUrl = process.env.LESSON_BASE_URL ?? "https://app.wittytalk.ai";

  if (!packagesTable || !noticeSentTable || !emailQueueUrl) {
    throw new Error(
      "CONVERSATION_PACKAGES_TABLE, NOTICE_SENT_TABLE, and EMAIL_QUEUE_URL must be set"
    );
  }

  const packagesRepo = new PackagesRepository(packagesTable);
  const noticeSentRepo = new NoticeSentRepository(noticeSentTable);
  const userEmailRepo = new UserEmailRepository(userEmailTable);
  const emailQueue = new EmailQueueClient(emailQueueUrl);
  const analysisFeedbackRepo = new AnalysisFeedbackRepository(analysisResultsTable);

  const sendLessonNoticesUseCase = new SendLessonNoticesUseCase(
    packagesRepo,
    noticeSentRepo,
    userEmailRepo,
    emailQueue,
    analysisFeedbackRepo,
    lessonBaseUrl
  );

  return { sendLessonNoticesUseCase };
}
