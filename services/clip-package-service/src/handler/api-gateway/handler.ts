import type { APIGatewayProxyEvent } from "aws-lambda";
import { parseRequest } from "./parse-request";
import { routes } from "./routes";
import { response, errorResponse } from "./response";
import type { RequestContext } from "./types";

function normalizePath(path: string): string {
  const p = path || "";
  if (p.startsWith("/v1/")) return p.substring(3);
  return p.startsWith("/") ? p : `/${p}`;
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

    const routeParts = routePath.split("/").filter(Boolean);
    const pathParts = pathWithoutQuery.split("/").filter(Boolean);
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

    if (req.method === "OPTIONS") {
      return response(200, {});
    }

    const actualPath = event.path || req.path;
    const normalizedPath = normalizePath(actualPath);
    const pathParams: Record<string, string> = { ...req.pathParams };

    const handler = findRouteHandler(req.method, normalizedPath, pathParams);
    if (!handler) {
      return response(404, { message: "Route not found" });
    }

    const requestWithPathParams: RequestContext = {
      ...req,
      path: normalizedPath,
      pathParams,
    };

    const result = await handler(requestWithPathParams);

    if (req.method === "POST") {
      return response(201, result);
    }
    if (req.method === "PUT" || req.method === "DELETE") {
      return response(200, result);
    }
    return response(200, result);
  } catch (err) {
    return errorResponse(err);
  }
}
