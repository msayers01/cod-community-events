"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@cod/db";
import { updateProfileSchema } from "@cod/shared";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { DomainError } from "@/lib/errors";

export async function updateProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    const input = updateProfileSchema.parse({
      displayName: formData.get("displayName"),
      activisionId: formData.get("activisionId") || null,
      streamUrl: formData.get("streamUrl") || null,
      bio: formData.get("bio") ?? "",
    });
    const taken = await prisma.user.findFirst({
      where: {
        displayName: { equals: input.displayName, mode: "insensitive" },
        NOT: { id: user.id },
      },
    });
    if (taken) throw new DomainError("NAME_TAKEN", "That display name is taken");
    await prisma.user.update({ where: { id: user.id }, data: input });
    revalidatePath("/account");
    return "Profile saved";
  });
}
