import { APIGatewayProxyEvent } from "aws-lambda";
import { parseRequest } from "./parse-request";
import { routes } from "./routes";
import { response, errorResponse } from "./response";

function normalizePath(path: string): string {
  if (path.startsWith("/v1/")) {
    return path.substring(3);
  }
  return path;
}

function findRouteHandler(method: string, path: string, pathParams: Record<string, string>): ((req: any) => Promise<any>) | null {
  const normalizedPath = normalizePath(path);
  const pathWithoutQuery = normalizedPath.split("?")[0];
  
  // Try exact match first
  const exactKey = `${method} ${pathWithoutQuery}`;
  if (routes[exactKey]) {
    return routes[exactKey];
  }
  
  // Try pattern matching for path parameters
  for (const routeKey of Object.keys(routes)) {
    const [routeMethod, routePath] = routeKey.split(" ", 2);
    
    if (routeMethod !== method) {
      continue;
    }
    
    if (routePath.includes("{")) {
      const routeParts = routePath.split("/");
      const pathParts = pathWithoutQuery.split("/");
      
      if (routeParts.length === pathParts.length) {
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
    }
  }
  
  return null;
}

export async function apiHandler(event: APIGatewayProxyEvent) {
  try {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    const req = parseRequest(event);
    
    // Handle OPTIONS preflight requests
    if (req.method === "OPTIONS") {
      return response(200, {});
    }
    
    const actualPath = event.path || req.path;
    const normalizedPath = normalizePath(actualPath);
    
    // User authentication - required for conversation endpoints, optional for plan/package endpoints
    let user: { id: string; role?: string } | null = null;
    try {
      const { requireUser } = await import("@libs/domain");
      user = requireUser(event);
    } catch (error) {
      // User authentication is optional for plan/package endpoints
      // Required endpoints will check in their controllers
      console.log("No user authentication provided");
    }
    
    const requestWithUser = {
      ...req,
      path: normalizedPath,
      pathParams: req.pathParams || {},
      user: user || undefined,
    };
    
    const handler = findRouteHandler(req.method, normalizedPath, requestWithUser.pathParams);

    if (!handler) {
      console.log("No handler found for:", `${req.method} ${req.path}`);
      return response(404, { message: "Route not found" });
    }

    const result = await handler(requestWithUser);
    console.log("Handler executed successfully");

    // Simple status inference
    if (req.method === "POST") {
      return response(201, result);
    }

    if (req.method === "PUT") {
      return response(200, result);
    }

    return response(200, result);

  } catch (err) {
    console.error("Error in apiHandler:", err);
    return errorResponse(err);
  }
}
