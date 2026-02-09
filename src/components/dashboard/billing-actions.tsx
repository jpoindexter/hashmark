"use client";

import { useState } from "react";
import { Button } from "@fabrk/components";

async function handleBillingAction(
  url: string,
  body?: object
): Promise<{ url?: string; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    return {
      error:
        data.error || "Something went wrong with billing. Please try again.",
    };
  }

  return data;
}

export function UpgradeButton({ priceId }: { priceId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await handleBillingAction("/api/billing/checkout", {
        priceId,
      });
      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else if (result.url) {
        window.location.href = result.url;
      }
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      <Button
        onClick={handleUpgrade}
        loading={loading}
        loadingText="REDIRECTING..."
      >
        {"> UPGRADE"}
      </Button>
      {error && (
        <p className="mt-2 type-caption text-destructive">{error}</p>
      )}
    </div>
  );
}

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManage = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await handleBillingAction("/api/billing/portal");
      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else if (result.url) {
        window.location.href = result.url;
      }
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      <Button
        variant="outline"
        onClick={handleManage}
        loading={loading}
        loadingText="REDIRECTING..."
      >
        {"> MANAGE SUBSCRIPTION"}
      </Button>
      {error && (
        <p className="mt-2 type-caption text-destructive">{error}</p>
      )}
    </div>
  );
}

export function PlanSelectButton({
  priceId,
  isCurrent,
}: {
  priceId: string;
  isCurrent: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isCurrent) {
    return (
      <Button variant="outline" disabled className="mt-4 w-full">
        CURRENT PLAN
      </Button>
    );
  }

  const handleSelect = async () => {
    if (!priceId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await handleBillingAction("/api/billing/checkout", {
        priceId,
      });
      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else if (result.url) {
        window.location.href = result.url;
      }
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      <Button
        className="mt-4 w-full"
        onClick={handleSelect}
        loading={loading}
        loadingText="REDIRECTING..."
      >
        {"> SELECT PLAN"}
      </Button>
      {error && (
        <p className="mt-2 type-caption text-destructive">{error}</p>
      )}
    </div>
  );
}
