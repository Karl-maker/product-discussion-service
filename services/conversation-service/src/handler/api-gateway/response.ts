import { APIGatewayProxyResult } from "aws-lambda";

export function response(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(error: any): APIGatewayProxyResult {
  console.error("Error:", error);

  if (error.name === "ValidationError") {
    return response(400, {
      error: "VALIDATION_ERROR",
      message: error.message,
    });
  }

  if (error.name === "NotFoundError") {
    return response(404, {
      error: "NOT_FOUND",
      message: error.message,
    });
  }

  if (error.name === "AuthenticationError") {
    return response(401, {
      error: "UNAUTHORIZED",
      message: error.message,
    });
  }

  return response(500, {
    error: "INTERNAL_ERROR",
    message: error.message || "An unexpected error occurred",
  });
}
