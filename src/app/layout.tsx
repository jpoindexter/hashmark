import type { Metadata } from "next";
import { Geist_Mono, Inter, Fraunces } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/toaster";
import { cn } from "@/lib/cn";
import "./globals.css";
import "./typography.css";
import "./monospace-web.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const fraunces = Fraunces({
  variable: "--font-crimson",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Hashmark — One scan. Every format. Always in sync.",
  description:
    "Hashmark scans your codebase and generates AI context files for every coding tool. AGENTS.md, CLAUDE.md, .cursorrules, and more — auto-synced via GitHub Action.",
  metadataBase: new URL("https://hashmark.md"),
  openGraph: {
    title: "Hashmark",
    description: "One scan. Every format. Always in sync.",
    url: "https://hashmark.md",
    siteName: "Hashmark",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hashmark",
    description: "One scan. Every format. Always in sync.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(geistMono.variable, inter.variable, fraunces.variable, "font-mono antialiased")}>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
