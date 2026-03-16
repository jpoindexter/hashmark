"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ruleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").nullable().optional(),
  rule: z.string().min(1, "Rule content is required").max(2000, "Rule too long (max 2000 chars)"),
  scope: z.enum(["REPO", "ORG"]).default("REPO"),
});

export async function createRule(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { plan: true } });
  if (user?.plan === "FREE") throw new Error("Custom rules require a Pro or Team plan.");

  const parsed = ruleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    rule: formData.get("rule"),
    scope: formData.get("scope") || "REPO",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  await db.customRule.create({
    data: { userId: session.user.id, ...parsed.data },
  });

  revalidatePath("/dashboard/settings");
}

export async function updateRule(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const ruleId = formData.get("ruleId") as string;
  if (!ruleId) throw new Error("Missing ruleId");

  const parsed = ruleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    rule: formData.get("rule"),
    scope: formData.get("scope") || "REPO",
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

  await db.customRule.update({
    where: { id: ruleId, userId: session.user.id },
    data: parsed.data,
  });

  revalidatePath("/dashboard/settings");
}

export async function toggleRule(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const ruleId = formData.get("ruleId") as string;
  if (!ruleId) throw new Error("Missing ruleId");

  const existing = await db.customRule.findUnique({
    where: { id: ruleId, userId: session.user.id },
  });
  if (!existing) throw new Error("Rule not found");

  await db.customRule.update({
    where: { id: ruleId },
    data: { enabled: !existing.enabled },
  });

  revalidatePath("/dashboard/settings");
}

export async function deleteRule(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const ruleId = formData.get("ruleId") as string;
  if (!ruleId) throw new Error("Missing ruleId");

  await db.customRule.delete({
    where: { id: ruleId, userId: session.user.id },
  });

  revalidatePath("/dashboard/settings");
}
