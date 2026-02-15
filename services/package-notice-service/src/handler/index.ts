import type { ScheduledHandler } from "aws-lambda";
import { scheduleHandler } from "./schedule.handler";

export const handler: ScheduledHandler = scheduleHandler;
