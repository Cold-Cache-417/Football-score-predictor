/* Shared provider HTTP helper (Phase 4A).

   Always returns a result object; never throws for network, timeout, HTTP or
   JSON failures. Every failure is written to the provider log so callers can
   surface it rather than silently substituting data. */

import { logProviderEvent } from "./log.mjs";

const USER_AGENT = "Calibra/0.4 (research project; provider data with permission)";

export async function fetchJson(
  url,
  { provider = "unknown", timeoutMs = 8000, fetchImpl = globalThis.fetch, headers = {} } = {}
) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": USER_AGENT, ...headers }
    });
    if (!response.ok) {
      logProviderEvent({
        provider,
        event: "request_failed",
        detail: { url, status: response.status }
      });
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }
    let data;
    try {
      data = await response.json();
    } catch {
      logProviderEvent({ provider, event: "malformed", detail: { url, status: response.status } });
      return { ok: false, status: response.status, error: "malformed JSON" };
    }
    return { ok: true, status: response.status, data, ms: Date.now() - started };
  } catch (error) {
    const timeout = error?.name === "AbortError";
    logProviderEvent({
      provider,
      event: timeout ? "timeout" : "request_failed",
      detail: {
        url,
        message: timeout ? `exceeded ${timeoutMs}ms` : String(error?.message || error)
      }
    });
    return { ok: false, status: 0, error: timeout ? "timeout" : "network error" };
  } finally {
    clearTimeout(timer);
  }
}
