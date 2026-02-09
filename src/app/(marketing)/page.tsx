import Link from "next/link";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Formats } from "@/components/landing/formats";
import { PricingTable } from "@/components/landing/pricing-table";
import { CliSection } from "@/components/landing/cli-section";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="text-accent text-2xl">#</span>
            <span className="uppercase tracking-wider">Hashmark</span>
          </Link>
          <div className="flex items-center gap-6">
            <a
              href="#pricing"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              PRICING
            </a>
            <a
              href="https://github.com/jpoindexter/hashmark#cli"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              CLI
            </a>
            <a
              href="/login"
              className="border border-border px-4 py-1.5 text-sm uppercase tracking-wider hover:bg-muted transition-colors"
            >
              {"> SIGN IN"}
            </a>
          </div>
        </div>
      </nav>

      <main>
        <Hero />
        <HowItWorks />
        <Formats />
        <CliSection />
        <PricingTable />
      </main>

      <Footer />
    </div>
  );
}
