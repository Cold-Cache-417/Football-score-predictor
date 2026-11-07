import Image from "next/image";
import { crestFor } from "@/lib/crests";
import { readableInk, teamColour, teamInitials } from "@/lib/teams";
import { cn } from "@/lib/utils";

type TeamCrestProps = {
  team: string;
  size?: number;
  priority?: boolean;
  className?: string;
};

/**
 * Club crest from web/public/crests (see src/lib/crest-registry.json for the
 * source and licence of each file). Falls back to a club-colour badge with
 * initials when no crest is available — never to a generated or guessed badge.
 */
export function TeamCrest({ team, size = 64, priority = false, className }: TeamCrestProps) {
  const record = crestFor(team);

  if (record) {
    return (
      <Image
        src={record.crest}
        alt={`${team} crest`}
        width={size}
        height={size}
        sizes={`${size}px`}
        priority={priority}
        className={cn(
          "object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.55)]",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  const colour = teamColour(team);
  return (
    <div
      role="img"
      aria-label={`${team} crest`}
      className={cn("flex items-center justify-center rounded-full", className)}
      style={{ width: size, height: size, backgroundColor: colour, color: readableInk(colour) }}
    >
      <span className="font-display font-semibold" style={{ fontSize: size * 0.34 }}>
        {teamInitials(team) || "FC"}
      </span>
    </div>
  );
}
