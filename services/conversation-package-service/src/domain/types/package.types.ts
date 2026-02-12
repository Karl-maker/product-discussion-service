export interface ConversationTarget {
  key: string;
  description: string;
  check: string;
  amount?: number;
}

export interface PackageConversation {
  name: string;
  instruction: string;
  targets: ConversationTarget[];
}

/** Optional notes on a package (all fields optional for backwards compatibility). */
export interface PackageNotes {
  title?: string;
  details?: string;
  content?: string;
}

export interface ConversationPackage {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags: string[];
  conversations: PackageConversation[];
  createdAt: string;
  updatedAt: string;
  /** Optional notes (title, details, content). */
  notes?: PackageNotes;
  /** When set, package is user-specific; only owner can see it when fetching by id or in list. */
  userId?: string;
  /** Optional language (e.g. for filtering). */
  language?: string;
}

export interface ConversationPackageFilters {
  category?: string;
  /** Filter list by language. */
  language?: string;
}

/** One feedback item from transcript analysis (AI returns ~3 of these). */
export interface TranscriptFeedbackItem {
  content: string;
  isPositive: boolean;
  /** Target keys that met their check requirements in this feedback context. */
  targets: string[];
}

/** One word the user said in the target language (when targetLanguage is requested). */
export interface TargetLanguageWord {
  word: string;
  pronunciation: string;
  meaning: string;
}

/** Validated response from the analyze-transcript endpoint / OpenAI. */
export interface TranscriptAnalysisResult {
  feedback: TranscriptFeedbackItem[];
  /** Present when targetLanguage was provided: words the user said in that language. */
  wordsUsed?: TargetLanguageWord[];
}
