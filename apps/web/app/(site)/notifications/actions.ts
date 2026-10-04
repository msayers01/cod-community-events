"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { markAllRead } from "@/modules/notifications/service";

export async function markAllReadAction() {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/notifications");
}
