import type { RequestContext } from "../../handler/api-gateway/types";
import type { ConversationPackage, PackageConversation } from "../../domain/types/package.types";
import { CreatePackageUseCase } from "../usecases/create.package.usecase";

function parsePackageItem(item: unknown): {
  name: string;
  description?: string;
  category: string;
  tags: string[];
  conversations: PackageConversation[];
} {
  const body = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const { name, description, category, tags, conversations } = body;
  if (!name || typeof name !== "string") {
    throw new Error("name is required");
  }
  if (!category || typeof category !== "string") {
    throw new Error("category is required");
  }
  return {
    name,
    description: typeof description === "string" ? description : undefined,
    category,
    tags: Array.isArray(tags) ? (tags as string[]) : [],
    conversations: Array.isArray(conversations) ? (conversations as PackageConversation[]) : [],
  };
}

export class CreatePackageController {
  constructor(private readonly useCase: CreatePackageUseCase) {}

  handle = async (req: RequestContext): Promise<ConversationPackage | { data: ConversationPackage[] }> => {
    const body = req.body;

    if (Array.isArray(body)) {
      if (body.length === 0) {
        return { data: [] };
      }
      const created: ConversationPackage[] = [];
      for (let i = 0; i < body.length; i++) {
        const input = parsePackageItem(body[i]);
        const pkg = await this.useCase.execute(input);
        created.push(pkg);
      }
      return { data: created };
    }

    const input = parsePackageItem(body ?? {});
    return this.useCase.execute(input);
  };
}
