import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-pine-800 bg-pine-950/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6 md:px-12">
        <Link
          href="/"
          className="font-display text-lg tracking-tight text-pine-100"
        >
          La Liga<span className="text-volt">.</span>Predict
        </Link>
        <div className="flex items-center gap-3">
          <Badge>LIVE</Badge>
          <span className="hidden text-xs text-pine-400 sm:inline">
            La Liga · Season 2026/27
          </span>
        </div>
      </div>
    </header>
  );
}
