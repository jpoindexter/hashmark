import Link from "next/link";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ProcessSection } from "@/components/landing/process";
import { FeaturesSection } from "@/components/landing/features";
import { Formats } from "@/components/landing/formats";
import { ComparisonSection } from "@/components/landing/comparison";
import { FaqSection } from "@/components/landing/faq";
import { CliSection } from "@/components/landing/cli-section";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <div
      className="marketing-page min-h-screen text-foreground selection:bg-sky-200 selection:text-foreground"
      style={{ fontFamily: "var(--font-crimson), Georgia, serif", backgroundColor: "var(--background)" }}
    >
      {/* Ambient cloud orbs */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[60%] h-[40%] rounded-full opacity-50" style={{ background: "rgba(224,242,254,0.5)", filter: "blur(80px)" }} />
        <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-40" style={{ background: "rgba(219,234,254,0.4)", filter: "blur(80px)" }} />
        <div className="absolute bottom-[10%] left-[15%] w-[40%] h-[40%] rounded-full opacity-30" style={{ background: "rgba(232,228,217,0.3)", filter: "blur(80px)" }} />
      </div>

      {/* Nav */}
      <nav className="fixed top-0 w-full z-50">
        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          <div className="flex justify-between items-center h-12">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center rounded-md bg-foreground text-background flex-shrink-0">
                <span className="font-bold text-xs leading-none" style={{ fontFamily: "var(--font-montserrat), sans-serif" }}>#</span>
              </div>
              <span className="text-sm font-semibold tracking-tight" style={{ fontFamily: "var(--font-montserrat), sans-serif" }}>Hashmark</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {[
                { label: "How it works", href: "#how-it-works" },
                { label: "Formats", href: "#formats" },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-xs tracking-wide transition-colors"
                  style={{ fontFamily: "var(--font-montserrat), sans-serif", color: "rgba(26,26,26,0.55)" }}
                >
                  {link.label}
                </a>
              ))}
              <a
                href="/login"
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  fontFamily: "var(--font-montserrat), sans-serif",
                  background: "var(--foreground)",
                  color: "var(--background)",
                }}
              >
                Connect repo →
              </a>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative">
        {/* Subtle narrative line */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 h-full w-px -z-10 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, transparent, #E8E4D9 15%, #E8E4D9 85%, transparent)" }}
        />
        <Hero />
        <HowItWorks />
        <ProcessSection />
        <FeaturesSection />
        <Formats />
        <ComparisonSection />
        <FaqSection />
        <CliSection />
      </main>

      <Footer />
    </div>
  );
}
