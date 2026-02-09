import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import "./typography.css";
import "./monospace-web.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" className="dark">
      <body className={`${geistMono.variable} font-mono antialiased`}>{children}</body>
    </html>
  );
}
