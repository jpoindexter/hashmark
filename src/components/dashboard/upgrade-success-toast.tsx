"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

export function UpgradeSuccessToast({ show }: { show: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (show) {
      toast.success("UPGRADE SUCCESSFUL", {
        description: "Your plan has been upgraded. All features are now unlocked.",
        duration: 5000,
      });

      // Clear the query param
      const params = new URLSearchParams(searchParams.toString());
      params.delete("upgraded");
      router.replace(`/dashboard?${params.toString()}`);
    }
  }, [show, router, searchParams]);

  return null;
}
