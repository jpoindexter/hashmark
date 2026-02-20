# Hashmark Scalability & Performance Strategy

This document outlines the architectural strategy to optimize Hashmark for high performance, scalability, and reliability.

## 1. Asynchronous Processing (The "Scanner Queue")

**Current State:**
Scans are executed synchronously in `src/app/api/scan/[repoId]/route.ts` via `runScan`, which spawns a child process (`execFile`) on the web server.
*   **Risk:** Long-running scans (>60s) will timeout on Vercel.
*   **Risk:** High concurrency will exhaust server CPU/RAM.

**Recommendation:**
Adopt a **Job Queue** architecture. Decouple the "Trigger" from the "Worker".

*   **Tools:**
    *   **Trigger.dev (Recommended for Vercel/Next.js):** Best DX, serverless-native, handles long-running jobs (up to hours).
    *   **BullMQ + Redis:** Traditional, robust, requires hosting a worker process (Railway/Heroku/ECS).
*   **Architecture:**
    1.  `POST /api/scan` -> Pushes job to Queue -> Returns `202 Accepted`.
    2.  Worker picks up job -> Clones Repo -> Runs CLI -> Updates DB.
    3.  Frontend polls `/api/scan/[id]` or uses WebSocket/SSE for status.

## 2. Database Optimization

**Current State:**
Prisma schema has basic indexes but lacks optimizations for high-volume read/write patterns.

**Immediate Improvements (Schema Changes):**
1.  **Index `createdAt` on `Scan`**: Vital for `orderBy: { createdAt: 'desc' }` queries (Dashboards).
2.  **Index `updatedAt` on `Repository`**: Useful for sorting repos by activity.
3.  **Composite Index on `GeneratedFile`**: `[scanId, format]` to speed up file retrieval by format.
4.  **JSONB Indexing**: If querying inside `Scan.results` (JSON) becomes common, add a GIN index (Postgres specific).

**Long-term:**
*   **Partitioning**: If `Scan` table grows >1M rows, partition by `createdAt` (by month).
*   **Cold Storage**: Move `GeneratedFile.content` (huge text blobs) to S3/R2 after 30 days. Only keep metadata in Postgres.

## 3. Caching Strategy

**Current State:**
Next.js `fetch` cache is likely active for 3rd party APIs, but DB queries are uncached.

**Recommendations:**
1.  **Request Memoization**: Ensure `auth()` and common DB calls are memoized per request (Next.js does this for `fetch`, use `React.cache` for DB calls).
2.  **Data Cache (unstable_cache)**: Wrap heavy dashboard queries (e.g., "User's Repo List") with `unstable_cache` and tag them (e.g., `user-repos-${userId}`). Invalidate tags on `connectRepo`.
3.  **Redis (Upstash/Vercel KV)**:
    *   **Rate Limiting**: Move `src/lib/rate-limit.ts` from in-memory Map to Redis. In-memory resets on serverless cold starts, making it ineffective.
    *   **Session Store**: If using database sessions, Redis is faster.

## 4. API Optimization

**Current State:**
Endpoints return full JSON objects.

**Improvements:**
1.  **Pagination**: `GET /api/repos` and `GET /api/scan/[id]/history` must support cursor-based pagination (`take`, `cursor`).
2.  **Partial Responses**: Allow clients to request specific fields (GraphQL-style or sparse fieldsets) to reduce payload size.
3.  **Compression**: Ensure Gzip/Brotli is enabled on the edge/server (Vercel default).

## 5. Code Splitting & Lazy Loading

**Current State:**
Next.js App Router handles route splitting.

**Improvements:**
1.  **Component Lazy Loading**: Use `next/dynamic` for heavy client components (e.g., `Recharts`, `Monaco Editor`, or large Lists).
    ```typescript
    const ScanChart = dynamic(() => import('@/components/charts/scan-chart'), {
      loading: () => <Skeleton className="h-64" />
    })
    ```
2.  **Barrel File Optimization**: Ensure `packages/ui` (FABRK) exports are tree-shakeable ("sideEffects": false).

## 6. Serverless vs. Long-Running

**Current State:**
Monolith.

**Strategy:**
*   **Web/API**: Stay Serverless (Vercel). It scales to zero and handles traffic spikes.
*   **Scanner**: Move to **Long-Running Container** or **Trigger.dev**.
    *   *Why?* `git clone` and AST parsing are CPU-intensive and slow.
    *   *Implementation:* A separate Docker container that listens to the Queue.

## 7. Performance Monitoring

**Current State:**
Console logs.

**Recommendations:**
1.  **Vercel Analytics**: Turn on for Real User Monitoring (Web Vitals).
2.  **Sentry**: For error tracking (backend + frontend).
3.  **OpenTelemetry**: If self-hosting, instrument the Next.js app to trace DB query latencies.
4.  **Log Drains**: Ship logs to Axiom or Datadog for better searchability than Vercel logs.

## Action Plan

1.  [x] **Analyze**: Audit current codebase.
2.  [ ] **Database**: Apply schema indexes (`Scan.createdAt`, `GeneratedFile.[scanId, format]`).
3.  [ ] **Pagination**: Update `api/repos` to support `page`/`limit`.
4.  [ ] **Rate Limiting**: Refactor `rate-limit.ts` to support a Redis adapter interface.
5.  [ ] **Queue**: scaffolding the `ScanQueue` interface (even if using in-memory for dev).
