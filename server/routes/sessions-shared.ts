/**
 * Shared mutable state for sessions routes.
 * Extracted so sessions-chat.ts and sessions-analytics.ts can access
 * the same activeProcesses / sessionLastActivity maps.
 */

export interface SessionSharedState {
  activeProcesses: Map<string, { kill: () => void }>;
  sessionLastActivity: Map<string, number>;
  studioPort: number;
}
