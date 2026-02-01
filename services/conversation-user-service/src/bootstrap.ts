import { ConversationUserRepository } from "./infrastructure/repositories/conversation-user.repository";
import { CreateConversationUserUseCase } from "./app/usecases/create.conversation.user.usecase";
import { GetConversationUserUseCase } from "./app/usecases/get.conversation.user.usecase";
import { UpdateConversationUserUseCase } from "./app/usecases/update.conversation.user.usecase";
import { CreateConversationUserController } from "./app/controllers/create.conversation.user.controller";
import { GetConversationUserController } from "./app/controllers/get.conversation.user.controller";
import { UpdateConversationUserController } from "./app/controllers/update.conversation.user.controller";

export function bootstrap() {
  const tableName = process.env.CONVERSATION_USERS_TABLE;
  if (!tableName) {
    throw new Error("CONVERSATION_USERS_TABLE environment variable is not set");
  }

  const repository = new ConversationUserRepository(tableName);

  const createConversationUserUseCase = new CreateConversationUserUseCase(repository);
  const getConversationUserUseCase = new GetConversationUserUseCase(repository);
  const updateConversationUserUseCase = new UpdateConversationUserUseCase(repository);

  const createConversationUserController = new CreateConversationUserController(createConversationUserUseCase);
  const getConversationUserController = new GetConversationUserController(getConversationUserUseCase);
  const updateConversationUserController = new UpdateConversationUserController(updateConversationUserUseCase);

  return {
    createConversationUserController,
    getConversationUserController,
    updateConversationUserController,
  };
}
