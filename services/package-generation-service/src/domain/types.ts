/** Incoming SQS message body (voice session record). */
export interface SessionMessage {
  sessionId: string;
  userId?: string;
  targetLanguage?: string;
  createdAt: string;
  expiresAt?: string;
  ttl?: number;
}

/** One analysis result record (from ANALYSIS_RESULTS_TABLE). */
export interface AnalysisResultRecord {
  userId: string;
  conversationPackageId: string;
  topicKey: string;
  result: {
    feedback: Array<{ content: string; isPositive: boolean; targets: string[] }>;
    wordsUsed?: Array<{ word: string; pronunciation: string; meaning: string }>;
  };
  targetLanguage?: string;
  targetsHit: Array<{ key: string; description: string; check: string; amount?: number }>;
  targetsMissed: Array<{ key: string; description: string; check: string; amount?: number }>;
  createdAt: string;
}

/** Conversation target for generated package. */
export interface ConversationTarget {
  key: string;
  description: string;
  check: string;
  amount?: number;
}

/** One conversation in a package. */
export interface PackageConversation {
  name: string;
  instruction: string;
  targets: ConversationTarget[];
}

/** Notes (title, details, content). */
export interface PackageNotes {
  title?: string;
  details?: string;
  content?: string;
}

/** Full package shape we generate (matches ConversationPackage minus id/timestamps which we set). */
export interface GeneratedPackage {
  name: string;
  description?: string;
  category: string;
  tags: string[];
  conversations: PackageConversation[];
  notes?: PackageNotes;
  language: string;
  /** Content field: words, writing, pronunciation details (stored in notes.content or description). */
}
