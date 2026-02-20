"use client";

import { OAuthButtons } from "./oauth-buttons";

export function LoginCard() {
  return (
    <div className="w-full max-w-md mono-box bg-card">
      {/* Brand header */}
      <div className="mb-[var(--grid-8)] text-center">
        <div className="mb-[var(--grid-4)] text-4xl font-bold text-accent">#</div>
        <h1 className="type-h2">
          HASHMARK
        </h1>
        <p className="mt-[var(--grid-2)] type-body text-muted-foreground">
          One scan. Every format. Always in sync.
        </p>
      </div>

      <div className="mb-[var(--grid-6)] border-t border-border" />

      {/* Auth section */}
      <div className="space-y-4">
        <p className="text-center type-label text-muted-foreground">
          [AUTH]: SIGN IN TO CONTINUE
        </p>
        <OAuthButtons />
      </div>

      {/* Footer note */}
      <div className="mt-[var(--grid-6)] text-center">
        <p className="type-caption text-muted-foreground">
          We&apos;ll request access to your repositories to scan and generate
          context files.
        </p>
      </div>
    </div>
  );
}
