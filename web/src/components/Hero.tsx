"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RippleGrid } from "@/components/RippleGrid";
import { TeamCrest } from "@/components/TeamCrest";
import { Badge } from "@/components/ui/badge";
import type { UpcomingFixture } from "@/lib/fixtures";
import { teamColour } from "@/lib/teams";

const OUTCOMES = [
  { key: "home", label: "Home", marker: "●", color: "#34D399" },
  { key: "draw", label: "Draw", marker: "○", color: "#F5C451" },
  { key: "away", label: "Away", marker: "▮", color: "#FF4D24" },
] as const;

type Outcome = (typeof OUTCOMES)[number];

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

function useCountUp(target: number, reduced: boolean, duration = 1500): number {
  const [display, setDisplay] = useState(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      setDisplay(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);
  return display;
}

function OutcomeBlock({
  outcome,
  value,
  index,
  reduced,
}: {
  outcome: Outcome;
  value: number;
  index: number;
  reduced: boolean;
}) {
  const display = useCountUp(value, reduced);
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = outcome.color;
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-baseline justify-between gap-4">
        <p
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-pine-400"
        >
          <span aria-hidden="true" style={{ color }}>
            {outcome.marker}
          </span>
          {outcome.label}
        </p>
        <span className="tabular-nums text-sm font-medium" style={{ color }}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <motion.span
        className="font-display leading-none tabular-nums"
        style={{ color, fontSize: "clamp(64px, 11vw, 128px)" }}
        initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
        animate={reduced ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 0.45 + index * 0.12, ease: EASE }}
      >
        {display.toFixed(2)}
      </motion.span>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={reduced ? { width: `${pct}%` } : { width: 0 }}
          animate={reduced ? { width: `${pct}%` } : { width: `${pct}%` }}
          transition={reduced ? { duration: 0 } : { duration: 1.4, delay: 0.9 + index * 0.12, ease: EASE }}
        />
      </div>
    </div>
  );
}

function CrestItem({ team, colour }: { team: string; colour: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <TeamCrest team={team} colour={colour} size={64} />
      <span className="max-w-[140px] truncate text-center text-[11px] font-medium uppercase tracking-[0.16em] text-pine-400">
        {team}
      </span>
    </div>
  );
}

function Hero({ fixture }: { fixture: UpcomingFixture | null }) {
  const reduced = useReducedMotion();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (reduced) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        setMousePosition({
          x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
          y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
        });
      }
    };
    
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [reduced]);

  const home = fixture?.home ?? "Home";
  const away = fixture?.away ?? "Away";
  const homeColour = teamColour(home);
  const awayColour = teamColour(away);
  const pHome = fixture?.p_blend_h ?? 0;
  const pDraw = fixture?.p_blend_d ?? 0;
  const pAway = fixture?.p_blend_a ?? 0;
  const topHomeGoals = fixture?.top_home_goals ?? 1;
  const topAwayGoals = fixture?.top_away_goals ?? 1;
  const topProb = fixture?.top_prob ?? 0;

  const outcomeValue = (key: string): number =>
    key === "home" ? pHome : key === "draw" ? pDraw : pAway;

  return (
    <section 
      ref={heroRef}
      className="relative min-h-screen overflow-hidden bg-pine-950 text-pine-100"
      style={{
        background: reduced 
          ? undefined 
          : `radial-gradient(circle at ${mousePosition.x * 20 + 50}% ${mousePosition.y * 20 + 50}%, rgba(217, 255, 63, 0.08), transparent 40%),
             linear-gradient(135deg, #060c09 0%, #0c1410 100%)`
      }}
    >
      <div className="absolute inset-0">
        <RippleGrid
          color="#D9FF3F"
          glow={0}
          variant="lines"
          cellSize={48}
          lineWidth={1}
          mouseInteraction={false}
          className="h-full w-full"
        />
      </div>
      <div className="hero-fine-grid pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-6 py-12 md:px-12">
        {/* Top zone */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-pine-400">
            La Liga · Season {fixture?.season ?? "2026/27"}
          </p>
          <div className="flex items-center gap-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-pine-400">
              {fixture?.date ?? "—"}
            </p>
            <Badge className="bg-pine-900 text-pine-100 border border-pine-800">PREDICTION</Badge>
          </div>
        </div>

        {/* Middle zone */}
        <div className="flex flex-1 flex-col items-center justify-center gap-10 md:gap-14">
          <div className="flex items-center gap-8 md:gap-14">
            <CrestItem team={home} colour={homeColour} />
            <div className="h-10 w-px bg-white/10 md:h-14" aria-hidden="true" />
            <CrestItem team={away} colour={awayColour} />
          </div>

          <div className="hidden w-full max-w-5xl md:grid md:grid-cols-3 md:gap-10">
            {OUTCOMES.map((o, i) => (
              <OutcomeBlock
                key={o.key}
                outcome={o}
                value={outcomeValue(o.key)}
                index={i}
                reduced={!!reduced}
              />
            ))}
          </div>
          <div className="flex w-full flex-col gap-8 md:hidden">
            {OUTCOMES.map((o, i) => (
              <OutcomeBlock
                key={o.key}
                outcome={o}
                value={outcomeValue(o.key)}
                index={i}
                reduced={!!reduced}
              />
            ))}
          </div>
        </div>

        {/* Bottom zone - Main score prediction */}
        <div className="flex flex-wrap items-center justify-between gap-6 border-t border-white/5 pt-8">
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-pine-400">
              Most likely score
            </p>
            <p className="font-display text-3xl tabular-nums text-pine-100">
              {topHomeGoals}–{topAwayGoals}
            </p>
            <p className="text-xs text-pine-400">P = {topProb.toFixed(3)}</p>
          </div>
          <div className="text-right flex flex-col gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-pine-400">
              Blend prediction (65/35)
            </p>
            <p className="font-display text-xl tabular-nums text-volt">
              {pHome.toFixed(2)} / {pDraw.toFixed(2)} / {pAway.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
