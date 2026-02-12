import type { RequestContext } from "../../handler/api-gateway/types";
import type { PackageConversation, PackageNotes } from "../../domain/types/package.types";
import { UpdatePackageUseCase } from "../usecases/update.package.usecase";

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

export class UpdatePackageController {
  constructor(private readonly useCase: UpdatePackageUseCase) {}

  handle = async (req: RequestContext) => {
    const id = req.pathParams?.id;
    if (!id) {
      throw new Error("id is required in path");
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const { name, description, category, tags, conversations, notes, language } = body;

    const input: {
      id: string;
      name?: string;
      description?: string;
      category?: string;
      tags?: string[];
      conversations?: PackageConversation[];
      notes?: PackageNotes;
      language?: string;
      currentUserId?: string;
    } = { id, currentUserId: req.user?.id };
    if (typeof name === "string") input.name = name;
    if (description !== undefined) input.description = typeof description === "string" ? description : undefined;
    if (typeof category === "string") input.category = category;
    if (Array.isArray(tags)) input.tags = tags as string[];
    if (Array.isArray(conversations)) input.conversations = conversations as PackageConversation[];
    const notesParsed = parseNotes(notes);
    if (notesParsed !== undefined) input.notes = notesParsed;
    if (typeof language === "string") input.language = language;

    return this.useCase.execute(input);
  };
}
