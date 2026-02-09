"use client";

import { OAuthButtons } from "./oauth-buttons";

export function LoginCard() {
  return (
    <div className="w-full max-w-md border border-border bg-card p-8">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <div className="mb-4 text-4xl font-bold text-accent">#</div>
        <h1 className="text-xl font-bold uppercase tracking-wider">
          HASHMARK
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One scan. Every format. Always in sync.
        </p>
      </div>

      <div className="mb-6 border-t border-border" />

      {/* Auth section */}
      <div className="space-y-4">
        <p className="text-center text-xs uppercase tracking-wider text-muted-foreground">
          [AUTH]: SIGN IN TO CONTINUE
        </p>
        <OAuthButtons />
      </div>

      {/* Footer note */}
      <div className="mt-6 text-center">
        <p className="text-xs text-muted-foreground">
          We&apos;ll request access to your repositories to scan and generate
          context files.
        </p>
      </div>
    </div>
  );
}
