"use client";

import { useState } from "react";
import { Button } from "@fabrk/components";

export function UpgradeButton({ priceId }: { priceId: string }) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleUpgrade} loading={loading} loadingText="REDIRECTING...">
      {"> UPGRADE"}
    </Button>
  );
}

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  const handleManage = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleManage} loading={loading} loadingText="REDIRECTING...">
      {"> MANAGE SUBSCRIPTION"}
    </Button>
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
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <Button
      className="mt-4 w-full"
      onClick={handleSelect}
      loading={loading}
      loadingText="REDIRECTING..."
    >
      {"> SELECT PLAN"}
    </Button>
  );
}
