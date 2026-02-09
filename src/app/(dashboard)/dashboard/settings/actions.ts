"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function createRule(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const name = formData.get("name") as string;
  const description = formData.get("description") as string | null;
  const rule = formData.get("rule") as string;
  const scope = (formData.get("scope") as "REPO" | "ORG") || "REPO";

  if (!name || !rule) throw new Error("Name and rule content are required");

  await db.customRule.create({
    data: {
      userId: session.user.id,
      name,
      description,
      rule,
      scope,
    },
  });

  revalidatePath("/dashboard/settings");
}

export async function updateRule(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const ruleId = formData.get("ruleId") as string;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string | null;
  const rule = formData.get("rule") as string;
  const scope = (formData.get("scope") as "REPO" | "ORG") || "REPO";

  if (!ruleId || !name || !rule) throw new Error("Missing required fields");

  await db.customRule.update({
    where: { id: ruleId, userId: session.user.id },
    data: { name, description, rule, scope },
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
