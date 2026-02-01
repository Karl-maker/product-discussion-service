import type { APIGatewayProxyEvent } from "aws-lambda";
import { parseRequest } from "./parse-request";
import { routes } from "./routes";
import { response, errorResponse } from "./response";
import type { RequestContext } from "./types";

function normalizePath(path: string): string {
  if (path.startsWith("/v1/")) {
    return path.substring(3);
  }
  return path;
}

function findRouteHandler(
  method: string,
  path: string,
  pathParams: Record<string, string>
): ((req: RequestContext) => Promise<unknown>) | null {
  const pathWithoutQuery = path.split("?")[0];

  const exactKey = `${method} ${pathWithoutQuery}`;
  if (routes[exactKey]) {
    return routes[exactKey];
  }

  for (const routeKey of Object.keys(routes)) {
    const [routeMethod, routePath] = routeKey.split(" ", 2);
    if (routeMethod !== method) continue;
    if (!routePath.includes("{")) continue;

    const routeParts = routePath.split("/");
    const pathParts = pathWithoutQuery.split("/");
    if (routeParts.length !== pathParts.length) continue;

    let matches = true;
    const extractedParams: Record<string, string> = {};
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith("{") && routeParts[i].endsWith("}")) {
        const paramName = routeParts[i].slice(1, -1);
        extractedParams[paramName] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      Object.assign(pathParams, extractedParams);
      return routes[routeKey];
    }
  }

  return null;
}

export async function apiHandler(event: APIGatewayProxyEvent) {
  try {
    const req = parseRequest(event);
    const actualPath = event.path || req.path;
    const normalizedPath = normalizePath(actualPath);

    if (req.method === "OPTIONS") {
      return response(200, {});
    }

    const pathParams: Record<string, string> = { ...req.pathParams };

    const isUsersRoute =
      normalizedPath.startsWith("/users") || normalizedPath.startsWith("users");
    let user: { id: string; role?: string } | null = null;
    if (isUsersRoute) {
      const { getCurrentUserFromEvent } = await import("@libs/domain");
      user = getCurrentUserFromEvent(event, { required: true });
    }

    console.log("Request", {
      method: req.method,
      path: normalizedPath,
      userId: user?.id ?? undefined,
    });

    const requestWithUser: RequestContext = {
      ...req,
      path: normalizedPath,
      pathParams,
      user: user ?? undefined,
    };

    const handler = findRouteHandler(req.method, normalizedPath, pathParams);

    if (!handler) {
      console.log("No handler found", { method: req.method, path: normalizedPath });
      return response(404, { message: "Route not found" });
    }

    const result = await handler(requestWithUser);

    if (req.method === "POST") {
      return response(201, result);
    }
    if (req.method === "PUT") {
      return response(200, result);
    }
    return response(200, result);
  } catch (err) {
    return errorResponse(err);
  }
}
