import type { CSSProperties, ReactNode } from "react";

type TeamCrestProps = {
  team: string;
  colour: string;
  size?: number;
};

/** Club crest: real SVG asset when available, initials badge fallback. */
export function TeamCrest({ team, colour, size = 40 }: TeamCrestProps) {
  const initials = team
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const style: CSSProperties = {
    width: size,
    height: size,
  };
  return (
    <div
      className="rounded-full flex items-center justify-center font-display font-semibold text-white select-none"
      style={{ ...style, backgroundColor: colour }}
      aria-label={`${team} crest`}
    >
      <span style={{ fontSize: size * 0.36 }}>{initials || "FC"}</span>
    </div>
  );
}
