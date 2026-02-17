/** Matches analytics/analysis wordsUsed returned to the client, plus timestamp of where it occurred. */
export interface UsedWord {
  word: string;
  pronunciation: string;
  meaning: string;
  timestamp: string;
}

export interface ClipPackage {
  id: string;
  thumbnailUrl: string;
  mediaUrl: string;
  characterName?: string;
  usedWords: UsedWord[];
  caption: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClipPackageInput {
  thumbnailUrl: string;
  mediaUrl: string;
  characterName?: string;
  usedWords: UsedWord[];
  caption: string;
  language: string;
}

export interface UpdateClipPackageInput {
  id: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  characterName?: string;
  usedWords?: UsedWord[];
  caption?: string;
  language?: string;
}
