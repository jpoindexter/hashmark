/**
 * API Routes Scanner Plugin
 */

import { join } from "path";
import type { ApiRoute, ApiSchema, ApiField, TypeExport } from "../types.js";
import type { ScannerPlugin, ScannerContext } from "../engine/types.js";
import { extractZodSchemasFromAST } from "./ast-schema-parser.js";

export class ApiRoutesScanner implements ScannerPlugin<ApiRoute[]> {
  name = "apiRoutes";
  filePatterns = ["**/{app,pages}/api/**/*.{ts,js}"];
  private routes: ApiRoute[] = [];
  private typeExports: TypeExport[] = [];

  constructor(typeExports: TypeExport[] = []) {
    this.typeExports = typeExports;
  }

  async onFile(path: string, content: string, context: ScannerContext) {
    if (path.includes("node_modules") || path.includes(".next")) return;
    
    // Check if it's a valid route file
    const isAppRouter = path.includes("/api/") && (path.endsWith("/route.ts") || path.endsWith("/route.js"));
    const isPagesRouter = path.includes("/api/") && !isAppRouter; // Standard .ts/.js in pages/api

    if (!isAppRouter && !isPagesRouter) return;

    const route = parseRoute(path, content, context.cwd, this.typeExports);
    if (route) {
      this.routes.push(route);
    }
  }

  getResult() {
    return this.routes.sort((a, b) => a.path.localeCompare(b.path));
  }
}

function parseRoute(file: string, content: string, projectRoot: string, typeExports?: TypeExport[]): ApiRoute | null {
  const methods: string[] = [];
  if (content.includes("export async function GET") || content.includes("export function GET")) methods.push("GET");
  if (content.includes("export async function POST") || content.includes("export function POST")) methods.push("POST");
  if (content.includes("export async function PUT") || content.includes("export function PUT")) methods.push("PUT");
  if (content.includes("export async function PATCH") || content.includes("export function PATCH")) methods.push("PATCH");
  if (content.includes("export async function DELETE") || content.includes("export function DELETE")) methods.push("DELETE");

  if (methods.length === 0 && content.includes("export default")) {
    if (content.includes("req.method")) {
      if (content.includes('"GET"') || content.includes("'GET'")) methods.push("GET");
      if (content.includes('"POST"') || content.includes("'POST'")) methods.push("POST");
      if (content.includes('"PUT"') || content.includes("'PUT'")) methods.push("PUT");
      if (content.includes('"DELETE"') || content.includes("'DELETE'")) methods.push("DELETE");
    }
    if (methods.length === 0) methods.push("ALL");
  }

  if (methods.length === 0) return null;

  const path = fileToApiPath(file);
  const isProtected = content.includes("auth()") || content.includes("getSession") || content.includes("session?.user") || content.includes("Unauthorized");

  const zodSchemas = extractZodSchemas(content, file, projectRoot);
  const tsSchemas = extractTypeScriptSchemas(content);

  let requestSchema = zodSchemas.requestSchema || tsSchemas.requestSchema;
  let responseSchema = zodSchemas.responseSchema || tsSchemas.responseSchema;
  const querySchema = zodSchemas.querySchema;

  if (!methods.some(m => ["POST", "PUT", "PATCH"].includes(m))) requestSchema = undefined;

  if (typeExports) {
    if (requestSchema?.source === "typescript" && requestSchema.name) requestSchema.fields = resolveTypeToFields(requestSchema.name, typeExports);
    if (responseSchema?.source === "typescript" && responseSchema.name) responseSchema.fields = resolveTypeToFields(responseSchema.name, typeExports);
  }

  return { path, methods, isProtected, requestSchema, responseSchema, querySchema };
}

function fileToApiPath(file: string): string {
  let path = file.replace(/\/route\.(ts|js)$/, "").replace(/\.(ts|js)$/, "");
  const appApiIndex = path.lastIndexOf("app/api/");
  const pagesApiIndex = path.lastIndexOf("pages/api/");
  if (appApiIndex !== -1) path = path.slice(appApiIndex + "app".length);
  else if (pagesApiIndex !== -1) path = path.slice(pagesApiIndex + "pages".length);
  else path = path.replace(/^src\//, "").replace(/^pages/, "").replace(/^app/, "");
  
  path = path.replace(/\[([^\]]+)\]/g, ":$1");
  return path.startsWith("/") ? path : "/" + path;
}

function extractZodSchemas(content: string, filePath: string, projectRoot: string) {
  const schemas: any = {};
  const allSchemas = extractZodSchemasFromAST(content, join(projectRoot, filePath), projectRoot);

  for (const [schemaName, schema] of allSchemas) {
    const nameLower = schemaName.toLowerCase();
    const isUsedForRequest = (content.includes(`${schemaName}.parse(`) || content.includes(`${schemaName}.safeParse(`)) &&
      (content.includes("req.json") || content.includes("request.json"));

    if (nameLower.includes("query") || nameLower.includes("params")) schemas.querySchema = { ...schema, name: schemaName, isRequired: true };
    else if (nameLower.includes("response") || nameLower.includes("output")) schemas.responseSchema = { ...schema, name: schemaName, isRequired: true };
    else if (nameLower.includes("request") || nameLower.includes("input") || isUsedForRequest) schemas.requestSchema = { ...schema, name: schemaName, isRequired: true };
  }
  return schemas;
}

function extractTypeScriptSchemas(content: string) {
  const schemas: any = {};
  const returnMatch = content.match(/(?:Promise|Response)<(?:NextResponse|Response)<(\w+)>>/);
  if (returnMatch) schemas.responseSchema = { source: "typescript", name: returnMatch[1], fields: [], isRequired: true };

  const bodyMatch = content.match(/const\s+\w+\s*:\s*(\w+(?:Request|Body|Payload|Input|Data))\s*=/);
  if (bodyMatch) schemas.requestSchema = { source: "typescript", name: bodyMatch[1], fields: [], isRequired: true };
  return schemas;
}

function resolveTypeToFields(typeName: string, typeExports: TypeExport[]): ApiField[] {
  const typeExport = typeExports.find((t) => t.name === typeName);
  if (!typeExport || !typeExport.properties) return [];
  return typeExport.properties.map((prop) => {
    const [name, type] = prop.split(":").map(s => s.trim());
    return { name: name.replace("?", ""), type: type || "unknown", isOptional: name.includes("?") };
  });
}

/** Legacy support */
export async function scanApiRoutes(dir: string, typeExports: TypeExport[] = []): Promise<ApiRoute[]> {
  const { ScannerRegistry } = await import("../engine/registry.js");
  const { CodebaseVisitor } = await import("../engine/visitor.js");
  const registry = new ScannerRegistry().register(new ApiRoutesScanner(typeExports));
  const visitor = new CodebaseVisitor(registry);
  const result = await visitor.visit(dir);
  return result.pluginResults.apiRoutes;
}
