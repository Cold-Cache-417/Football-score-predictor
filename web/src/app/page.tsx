import { Suspense } from "react";
import { HeroSection } from "@/components/HeroSection";
import { SiteNav } from "@/components/SiteNav";

function HeroFallback() {
  return <div className="atmo min-h-[calc(100svh-3.5rem)]" aria-hidden="true" />;
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-pine-950">
      <SiteNav />
      <main className="flex-1">
        <Suspense fallback={<HeroFallback />}>
          <HeroSection />
        </Suspense>
      </main>
    </div>
  );
}
