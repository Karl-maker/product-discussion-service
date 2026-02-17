/** Matches analysis results: word + timestamp of where it occurred (e.g. in transcript). */
export interface UsedWord {
  word: string;
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
