import type { LatestPackagesRepository } from "../infrastructure/repositories/latest-packages.repository";
import type { NoticeSentRepository } from "../infrastructure/repositories/notice-sent.repository";
import type { AnalysisFeedbackRepository } from "../infrastructure/repositories/analysis-feedback.repository";
import type { EmailQueueClient } from "../infrastructure/email-queue.client";

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export class SendNoticesUseCase {
  constructor(
    private readonly latestPackages: LatestPackagesRepository,
    private readonly noticeSent: NoticeSentRepository,
    private readonly analysisFeedback: AnalysisFeedbackRepository,
    private readonly emailQueue: EmailQueueClient
  ) {}

  async execute(): Promise<{ sent: number; skipped: number }> {
    const users = await this.latestPackages.getLatestPackagePerUser();
    let sent = 0;
    let skipped = 0;

    for (const pkg of users) {
      const skip = await this.noticeSent.wasSentWithinLastSevenDays(pkg.userId);
      if (skip) {
        skipped++;
        continue;
      }

      const pastFeedback = await this.analysisFeedback.getRecentFeedbackContent(pkg.userId, 5);
      const languageLabel = capitalizeFirst(pkg.targetLanguage || "Lesson");
      const header = `Start Practicing ${languageLabel}: ${pkg.name}`;
      const description = pkg.description ?? "Your next lesson is ready to practice.";
      const note = pkg.notes?.details ?? pkg.notes?.content ?? undefined;
      const lessonUrl = `${process.env.APP_BASE_URL ?? "https://app.wittytalk.ai"}/learn`;

      await this.emailQueue.sendLessonNotice({
        template: "lesson.hbs",
        header,
        to: pkg.userId,
        content: {
          userId: pkg.userId,
          lessonName: pkg.name,
          description,
          lessonUrl,
          ...(note && { note }),
          ...(pastFeedback.length > 0 && { pastFeedback }),
        },
      });

      await this.noticeSent.recordSent(pkg.userId);
      sent++;
    }

    return { sent, skipped };
  }
}
