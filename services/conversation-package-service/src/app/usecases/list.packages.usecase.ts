import { ConversationPackageRepository } from "../../infrastructure/repositories/conversation-package.repository";
import type { ConversationPackage, ConversationPackageFilters } from "../../domain/types/package.types";
import type {
  Pagination,
  PaginatedResult,
  ListOptions,
} from "../../infrastructure/repositories/conversation-package.repository";

export interface ListPackagesInput {
  filters: ConversationPackageFilters;
  pagination: Pagination;
  options?: ListOptions;
}

export class ListPackagesUseCase {
  constructor(private readonly repository: ConversationPackageRepository) {}

  async execute(input: ListPackagesInput): Promise<PaginatedResult<ConversationPackage>> {
    return this.repository.list(input.filters, input.pagination, input.options);
  }
}
