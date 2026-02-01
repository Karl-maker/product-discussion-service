import { bootstrap } from "../../bootstrap";
import type { RequestContext } from "./types";

const {
  createConversationUserController,
  getConversationUserController,
  updateConversationUserController,
} = bootstrap();

export const routes: Record<string, (req: RequestContext) => Promise<unknown>> = {
  "POST /users": createConversationUserController.handle,
  "GET /users/{userId}": getConversationUserController.handle,
  "PUT /users/{userId}": updateConversationUserController.handle,
};
