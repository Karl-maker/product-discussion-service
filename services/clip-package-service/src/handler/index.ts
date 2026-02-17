import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { apiHandler } from "./api-gateway/handler";

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return apiHandler(event);
}
