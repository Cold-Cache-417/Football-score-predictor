import registry from "./crest-registry.json";

export type CrestRecord = {
  crest: string;
  wikipedia: string | null;
  filePage: string | null;
  license: string | null;
  usage: string | null;
};

const REGISTRY = registry as Record<string, CrestRecord>;

/**
 * Crest provenance. Every entry points at a Wikimedia-hosted club logo and
 * records the licence reported for that file. Most club crests are
 * non-free ("Fair use") on English Wikipedia; they are used here only to
 * identify the club in a private, non-commercial project.
 */
export function crestFor(team: string): CrestRecord | null {
  return REGISTRY[team] ?? null;
}

export const CRESTS = REGISTRY;

export function crestCount(): number {
  return Object.keys(REGISTRY).length;
}
