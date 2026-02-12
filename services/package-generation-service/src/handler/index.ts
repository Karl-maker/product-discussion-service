import type { SQSEvent } from "aws-lambda";
import { sqsHandler } from "./sqs.handler";

export async function handler(event: SQSEvent) {
  return sqsHandler(event);
}
