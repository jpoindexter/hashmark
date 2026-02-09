/**
 * Centralized API endpoint constants.
 * All client-side fetch calls should reference these instead of hardcoded strings.
 */

export const AUTH_ENDPOINTS = {
  CALLBACK: "/api/auth/callback/github",
} as const;

export const REPO_ENDPOINTS = {
  LIST: "/api/repos",
} as const;

export const SCAN_ENDPOINTS = {
  TRIGGER: (repoId: string) => `/api/scan/${repoId}`,
  LATEST: (repoId: string) => `/api/scan/${repoId}/latest`,
  DOWNLOAD: (repoId: string) => `/api/scan/${repoId}/download`,
} as const;

export const BILLING_ENDPOINTS = {
  CHECKOUT: "/api/billing/checkout",
  PORTAL: "/api/billing/portal",
  WEBHOOK: "/api/billing/webhook",
} as const;

export const WEBHOOK_ENDPOINTS = {
  GITHUB: "/api/webhooks/github",
} as const;
