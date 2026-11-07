import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-pine-950/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 md:px-10">
        <Link
          href="/"
          className="font-display text-[17px] tracking-tight text-pine-100 transition-opacity hover:opacity-80"
        >
          La Liga<span className="text-volt">.</span>Predict
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden text-[11px] tracking-[0.12em] text-pine-400 sm:inline">
            Dixon-Coles + CatBoost
          </span>
          <span className="text-[11px] tracking-[0.12em] text-pine-400">2026/27</span>
        </div>
      </div>
    </header>
  );
}
