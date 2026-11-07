import { connection } from "next/server";
import { Hero } from "@/components/Hero";
import { getHeroState } from "@/lib/fixtures";

/**
 * Fixture selection depends on the current time, so this subtree renders per
 * request instead of being frozen into the static shell at build time.
 */
export async function HeroSection() {
  await connection();
  return <Hero state={getHeroState(new Date())} />;
}
