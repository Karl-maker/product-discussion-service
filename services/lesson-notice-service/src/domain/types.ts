/** Package item as stored (minimal for notice). */
export interface PackageItem {
  id: string;
  name: string;
  description?: string;
  userId: string;
  targetLanguage?: string;
  updatedAt: string;
  notes?: { title?: string; details?: string; content?: string };
}

/** Payload sent to email SQS. */
export interface LessonNoticeEmailPayload {
  template: string;
  header: string;
  to: string;
  content: {
    email: string;
    userId: string;
    lessonName: string;
    description: string;
    note?: string;
    pastFeedback: string[];
    lessonUrl: string;
  };
}
