"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TeamCrest } from "@/components/TeamCrest";
import type { HeroState, UpcomingMatch } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

const SHELL = "min-h-[calc(100svh-57px)]";

const OUTCOMES = [
  { label: "Home", colour: "#34D399" },
  { label: "Draw", colour: "#F5C451" },
  { label: "Away", colour: "#FF4D24" },
] as const;

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Tracks prefers-reduced-motion without pulling in an animation library. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

/**
 * Cursor-reactive light. A single animation frame loop writes two CSS custom
 * properties; React never re-renders on pointer movement. Skipped entirely
 * for reduced motion and for coarse pointers (touch).
 */
function useCursorLight(enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const target = { x: 0.5, y: 0.3 };
    const current = { x: 0.5, y: 0.3 };
    let frame = 0;
    let running = false;

    const step = () => {
      current.x += (target.x - current.x) * 0.1;
      current.y += (target.y - current.y) * 0.1;
      node.style.setProperty("--glow-x", `${(current.x * 100).toFixed(2)}%`);
      node.style.setProperty("--glow-y", `${(current.y * 100).toFixed(2)}%`);

      const settled =
        Math.abs(target.x - current.x) < 0.0008 && Math.abs(target.y - current.y) < 0.0008;
      if (settled) {
        running = false;
        return;
      }
      frame = requestAnimationFrame(step);
    };

    const onMove = (event: PointerEvent) => {
      const box = node.getBoundingClientRect();
      target.x = (event.clientX - box.left) / box.width;
      target.y = (event.clientY - box.top) / box.height;
      if (!running) {
        running = true;
        frame = requestAnimationFrame(step);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [enabled]);

  const setRef = useCallback((node: HTMLElement | null) => {
    ref.current = node;
  }, []);

  return setRef;
}

function TeamSide({
  team,
  side,
  className,
}: {
  team: string;
  side: "home" | "away";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 md:gap-4",
        side === "home" ? "md:items-end" : "md:items-start",
        className,
      )}
    >
      <TeamCrest team={team} size={84} priority />
      <p
        className={cn(
          "font-display text-balance text-center text-[clamp(21px,2.9vw,36px)] leading-[1.06] text-pine-100",
          side === "home" ? "md:text-right" : "md:text-left",
        )}
      >
        {team}
      </p>
    </div>
  );
}

function Score({ match }: { match: UpcomingMatch }) {
  return (
    <div className="col-span-2 row-start-2 flex flex-col items-center gap-2 md:col-span-1 md:col-start-2 md:row-start-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-pine-400">
        Most likely score
      </span>
      <div className="flex items-baseline font-display leading-[0.8] text-pine-100">
        <span className="tabular-nums text-[clamp(66px,9.6vw,132px)]">{match.homeGoals}</span>
        <span className="mx-[0.1em] text-[clamp(32px,4.6vw,60px)] text-pine-100/30">–</span>
        <span className="tabular-nums text-[clamp(66px,9.6vw,132px)]">{match.awayGoals}</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="tabular-nums text-[clamp(18px,2vw,24px)] font-medium text-volt">
          {pct(match.scoreProb)}
        </span>
        <span className="text-[10.5px] tracking-[0.04em] text-pine-400">
          chance of this exact scoreline
        </span>
      </div>
      <p className="mt-2 text-[11px] tracking-[0.08em] text-pine-400">
        {match.kickoffDateLabel} · {match.kickoffTimeLabel}
        {match.kickoffZoneLabel ? ` ${match.kickoffZoneLabel}` : ""}
      </p>
    </div>
  );
}

function OutcomeSplit({ match }: { match: UpcomingMatch }) {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="bar-reveal flex h-[7px] w-full overflow-hidden rounded-full bg-white/[0.05]">
        {match.blend.map((value, index) => (
          <div
            key={OUTCOMES[index].label}
            className="h-full"
            style={{
              flexBasis: `${value * 100}%`,
              backgroundColor: OUTCOMES[index].colour,
              opacity: active === null || active === index ? 1 : 0.28,
              transition: "opacity 220ms ease",
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-6">
        {match.blend.map((value, index) => (
          <div
            key={OUTCOMES[index].label}
            className={cn(
              "flex cursor-default flex-col gap-1",
              index === 1 && "items-center text-center",
              index === 2 && "items-end text-right",
            )}
            onPointerEnter={() => setActive(index)}
            onPointerLeave={() => setActive(null)}
          >
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-pine-400">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: OUTCOMES[index].colour }}
              />
              {OUTCOMES[index].label}
            </span>
            <span
              className="tabular-nums font-display text-[clamp(23px,3.2vw,36px)] leading-none"
              style={{ color: OUTCOMES[index].colour }}
            >
              {pct(value)}
            </span>
            <span className="tabular-nums text-[10px] tracking-[0.02em] text-pine-400/70">
              DC {pct(match.dc[index])} · CB {pct(match.cat[index])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ state }: { state: HeroState }) {
  return (
    <section className={cn("atmo relative isolate flex items-center overflow-hidden", SHELL)}>
      <div aria-hidden="true" className="atmo-grid pointer-events-none absolute inset-0" />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-16 md:px-10">
        <p className="mb-6 text-[11px] tracking-[0.14em] text-pine-400">
          Prediction snapshot · {state.snapshotLabel} CET
        </p>
        <h1 className="max-w-3xl font-display text-[clamp(30px,5vw,58px)] leading-[1.05] text-pine-100">
          {state.reason === "no_file"
            ? "No prediction snapshot found."
            : "No unplayed La Liga fixtures in this snapshot."}
        </h1>
        <p className="mt-6 max-w-xl text-[13.5px] leading-relaxed text-pine-400">
          {state.reason === "no_file"
            ? "The website reads data/website/upcoming_predictions.csv, which is missing. Run python -m src.export_website to build it."
            : `All ${state.totalUpcoming} exported fixtures have already kicked off. Re-run python -m src.export_website to refresh the snapshot. A finished match is never shown here as upcoming.`}
        </p>
      </div>
    </section>
  );
}

export function Hero({ state }: { state: HeroState }) {
  const reduced = usePrefersReducedMotion();
  const sectionRef = useCursorLight(!reduced);

  if (!state.match) return <EmptyState state={state} />;

  const match = state.match;

  return (
    <section
      ref={sectionRef}
      className={cn("atmo relative isolate overflow-hidden", SHELL)}
    >
      <div aria-hidden="true" className="atmo-grid pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="atmo-light pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-pine-950 to-transparent"
      />

      <div
        className={cn(
          "relative z-10 mx-auto flex w-full max-w-6xl flex-col px-5 py-6 md:px-10 md:py-8",
          SHELL,
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="text-[11px] tracking-[0.14em] text-pine-400">{match.season} season</p>
          <p className="text-[11px] tracking-[0.14em] text-pine-400">
            Prediction snapshot · {state.snapshotLabel} CET
          </p>
        </div>

        <div className="flex flex-1 items-center py-6">
          <div className="grid w-full grid-cols-2 items-center gap-x-3 gap-y-6 md:grid-cols-[1fr_auto_1fr] md:gap-x-8">
            <TeamSide team={match.home} side="home" className="col-start-1 row-start-1" />
            <Score match={match} />
            <TeamSide
              team={match.away}
              side="away"
              className="col-start-2 row-start-1 md:col-start-3"
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <OutcomeSplit match={match} />

          <div className="flex flex-col gap-2.5 border-t border-white/[0.07] pt-4 md:flex-row md:items-start md:justify-between md:gap-10">
            <p className="max-w-md text-[12px] leading-relaxed text-pine-400">
              Home, draw and away are the 65/35 blend of Dixon-Coles and CatBoost. The scoreline
              comes from Dixon-Coles alone, so the two need not agree.
            </p>
            <p className="max-w-xs text-[11.5px] leading-relaxed text-pine-400/85">
              Test RPS 0.1929 against the bookmaker&apos;s 0.1888 over 1,140 matches. The model does
              not beat the market.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
