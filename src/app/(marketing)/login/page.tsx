import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginCard } from "@/components/shared/login-card";

export const metadata = {
  title: "Sign In — Hashmark",
  description: "Sign in to Hashmark to generate and sync AI context files for your repositories.",
  robots: { index: false },
};

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-mono">
      <Suspense>
        <LoginCard />
      </Suspense>
    </div>
  );
}
