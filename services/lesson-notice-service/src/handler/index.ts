import type { ScheduledHandler } from "aws-lambda";
import { bootstrap } from "../bootstrap";

export const handler: ScheduledHandler = async (_event, _context) => {
  const { sendLessonNoticesUseCase } = bootstrap();
  await sendLessonNoticesUseCase.execute({});
};
