import { Badge } from "@fabrk/components";
import type { Plan } from "@prisma/client";

const planConfig: Record<Plan, { label: string; variant: "default" | "accent" | "secondary" }> = {
  FREE: { label: "FREE", variant: "secondary" },
  PRO: { label: "PRO", variant: "accent" },
  TEAM: { label: "TEAM", variant: "default" },
};

export function PlanBadge({ plan }: { plan: Plan }) {
  const config = planConfig[plan];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
