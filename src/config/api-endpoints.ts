/**
 * Centralized API endpoint constants.
 * All client-side fetch calls should reference these instead of hardcoded strings.
 * Pattern adapted from indx/web/src/config/api-endpoints.ts
 */

export const AUTH_ENDPOINTS = {
  CALLBACK: "/api/auth/callback/github",
} as const;

export const REPO_ENDPOINTS = {
  LIST: "/api/repos",
  CONNECT: "/api/repos/connect",
  DISCONNECT: (repoId: string) => `/api/repos/${repoId}`,
} as const;

export const SCAN_ENDPOINTS = {
  TRIGGER: (repoId: string) => `/api/scan/${repoId}`,
  LATEST: (repoId: string) => `/api/scan/${repoId}/latest`,
} as const;

export const FILE_ENDPOINTS = {
  GET: (repoId: string, format: string) => `/api/files/${repoId}/${format}`,
} as const;

export const BILLING_ENDPOINTS = {
  CHECKOUT: "/api/billing/checkout",
  PORTAL: "/api/billing/portal",
  WEBHOOK: "/api/billing/webhook",
} as const;

export const WEBHOOK_ENDPOINTS = {
  GITHUB: "/api/webhooks/github",
} as const;
