/* Provider event log (Phase 4A).

   A bounded in-memory trail so failures, timeouts, malformed payloads and
   fallbacks are observable instead of silent. No secrets, no payload bodies. */

const MAX_EVENTS = 200;
const events = [];

export function logProviderEvent({ provider, event, detail = {}, at = new Date().toISOString() }) {
  events.push({ at, provider, event, ...detail });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return events[events.length - 1];
}

export function getProviderLog({ provider, event } = {}) {
  return events.filter(
    (entry) =>
      (!provider || entry.provider === provider) && (!event || entry.event === event)
  );
}

export function clearProviderLog() {
  events.length = 0;
}
