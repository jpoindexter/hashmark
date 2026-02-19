/**
 * Component & Data Grouping Utilities
 * 
 * Shared logic for grouping components by directory and formatting
 * directory names for documentation.
 */

import type { Component } from "../types.js";

/**
 * Groups components by their parent directory
 */
export function groupComponentsByDirectory(components: Component[]): Record<string, Component[]> {
  const grouped: Record<string, Component[]> = {};

  for (const comp of components) {
    const parts = comp.path.split("/");
    parts.pop();
    const dir = parts.join("/") || "root";

    if (!grouped[dir]) {
      grouped[dir] = [];
    }
    grouped[dir].push(comp);
  }

  return grouped;
}

/**
 * Formats a directory path into a readable category name
 */
export function formatDirectoryName(dir: string): string {
  if (dir === "root") return "Base Components";
  
  const parts = dir.split("/");
  const lastPart = parts.pop() || dir;

  const nameMap: Record<string, string> = {
    ui: "UI Components",
    charts: "Charts",
    auth: "Auth",
    admin: "Admin",
    billing: "Billing",
    shared: "Shared Components",
    dashboard: "Dashboard",
    landing: "Landing",
  };

  const baseName = nameMap[lastPart.toLowerCase()] ??
    lastPart.split(/[-_]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

  // Add parent context to disambiguate (e.g., "web > UI Components")
  const genericDirs = new Set(["src", "components", "app", "pages", "lib", "hooks"]);
  const contextPart = parts.filter((p) => !genericDirs.has(p)).pop();
  
  if (contextPart && parts.length > 1) {
    return `${contextPart} > ${baseName}`;
  }

  return baseName;
}
