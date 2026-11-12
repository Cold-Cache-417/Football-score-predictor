/* Process-level state shared by the entry point and the API, so /api/health can
   report the last refresh without building a full payload. */

export const runtime = {
  startedAt: new Date().toISOString(),
  lastRefresh: { at: null, rows: null, error: null }
};
