import type { RequestContext } from "../../handler/api-gateway/types";
import type {
  ConversationPackage,
  PackageConversation,
  PackageNotes,
} from "../../domain/types/package.types";
import { CreatePackageUseCase } from "../usecases/create.package.usecase";

function parseNotes(notes: unknown): PackageNotes | undefined {
  if (notes == null || typeof notes !== "object") return undefined;
  const o = notes as Record<string, unknown>;
  const title = o.title; const details = o.details; const content = o.content;
  if (title === undefined && details === undefined && content === undefined) return undefined;
  return {
    ...(typeof title === "string" && { title }),
    ...(typeof details === "string" && { details }),
    ...(typeof content === "string" && { content }),
  };
}

function parsePackageItem(
  item: unknown,
  userId?: string
): {
  name: string;
  description?: string;
  category: string;
  tags: string[];
  conversations: PackageConversation[];
  notes?: PackageNotes;
  userId?: string;
  language?: string;
} {
  const body = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const { name, description, category, tags, conversations, notes, language } = body;
  if (!name || typeof name !== "string") {
    throw new Error("name is required");
  }
  if (!category || typeof category !== "string") {
    throw new Error("category is required");
  }
  const parsed: {
    name: string;
    description?: string;
    category: string;
    tags: string[];
    conversations: PackageConversation[];
    notes?: PackageNotes;
    userId?: string;
    language?: string;
  } = {
    name,
    description: typeof description === "string" ? description : undefined,
    category,
    tags: Array.isArray(tags) ? (tags as string[]) : [],
    conversations: Array.isArray(conversations) ? (conversations as PackageConversation[]) : [],
  };
  const notesParsed = parseNotes(notes);
  if (notesParsed && Object.keys(notesParsed).length > 0) parsed.notes = notesParsed;
  if (userId) parsed.userId = userId;
  if (typeof language === "string") parsed.language = language;
  return parsed;
}

export class CreatePackageController {
  constructor(private readonly useCase: CreatePackageUseCase) {}

  handle = async (req: RequestContext): Promise<ConversationPackage | { data: ConversationPackage[] }> => {
    const body = req.body;
    const userId = req.user?.id;

    if (Array.isArray(body)) {
      if (body.length === 0) {
        return { data: [] };
      }
      const created: ConversationPackage[] = [];
      for (let i = 0; i < body.length; i++) {
        const input = parsePackageItem(body[i], userId);
        const pkg = await this.useCase.execute(input);
        created.push(pkg);
      }
      return { data: created };
    }

    const input = parsePackageItem(body ?? {}, userId);
    return this.useCase.execute(input);
  };
}
