import type { PackageItem } from "../domain/types";
import type { PackagesRepository } from "../infrastructure/packages.repository";
import type { NoticeSentRepository } from "../infrastructure/notice-sent.repository";
import type { UserEmailRepository } from "../infrastructure/user-email.repository";
import type { EmailQueueClient } from "../infrastructure/email-queue.client";
import type { AnalysisFeedbackRepository } from "../infrastructure/analysis-feedback.repository";

const MAX_USERS_TO_PROCESS = 100;
const MAX_SCAN_PER_RUN = 2000;
const MAX_PAST_FEEDBACK = 5;

function capitalizeLanguage(lang: string): string {
  if (!lang) return "";
  const lower = lang.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export class SendLessonNoticesUseCase {
  constructor(
    private readonly packagesRepo: PackagesRepository,
    private readonly noticeSentRepo: NoticeSentRepository,
    private readonly userEmailRepo: UserEmailRepository,
    private readonly emailQueue: EmailQueueClient,
    private readonly analysisFeedbackRepo: AnalysisFeedbackRepository,
    private readonly lessonBaseUrl: string
  ) {}

  async execute(_input: {}): Promise<void> {
    const latestPerUser = await this.packagesRepo.getLatestPackagePerUser(MAX_SCAN_PER_RUN);
    const userIds = Array.from(latestPerUser.keys()).slice(0, MAX_USERS_TO_PROCESS);
    let sent = 0;
    for (const userId of userIds) {
      const pkg = latestPerUser.get(userId)!;
      const skipped = await this.noticeSentRepo.wasSentInLast7Days(userId);
      if (skipped) continue;
      const email = await this.userEmailRepo.getEmail(userId);
      if (!email) {
        console.info(`Lesson notice: no email for userId=${userId}, skipping`);
        continue;
      }
      const pastFeedback = await this.analysisFeedbackRepo.getRecentFeedbackStrings(userId, MAX_PAST_FEEDBACK);
      const languageName = capitalizeLanguage(pkg.targetLanguage ?? "Lesson");
      const header = `Start Practicing ${languageName}: ${pkg.name}`;
      const description = pkg.description ?? pkg.notes?.details ?? pkg.notes?.content ?? "Your next lesson is ready.";
      const note = pkg.notes?.content ?? pkg.notes?.details;
      const lessonUrl = `${this.lessonBaseUrl.replace(/\/$/, "")}/lesson/${pkg.id}`;
      const payload = {
        template: "lesson.hbs",
        header,
        to: email,
        content: {
          email,
          userId,
          lessonName: pkg.name,
          description,
          note: note ?? undefined,
          pastFeedback,
          lessonUrl,
        },
      };
      await this.emailQueue.sendLessonNotice(payload);
      await this.noticeSentRepo.recordSent(userId);
      sent++;
    }
    console.info(`Lesson notice: sent ${sent} notices (checked ${userIds.length} users)`);
  }
}
