export interface ConversationPackage {
  id: string;
  name: string;
  description?: string;
  productId?: string;
  topics: string[];
  categories: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationPackageFilters {
  category?: string;
} 
