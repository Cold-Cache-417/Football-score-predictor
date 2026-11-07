import { Hero } from "@/components/Hero";
import { SiteNav } from "@/components/SiteNav";
import { nextUpcomingFixture } from "@/lib/fixtures";

export default function Home() {
  const fixture = nextUpcomingFixture();
  return (
    <div className="flex min-h-screen flex-col bg-pine-950">
      <SiteNav />
      <Hero fixture={fixture} />
    </div>
  );
}
