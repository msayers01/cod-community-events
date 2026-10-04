import { headers, cookies } from "next/headers";
import { prisma } from "@cod/db";
import type { Actor } from "@cod/shared";
import { auth } from "./auth";
import { env } from "./env";

export const DEV_SESSION_COOKIE = "cod_dev_user";

export interface CurrentUser {
  id: string;
  displayName: string;
  status: string;
  actor: Actor;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  let userId: string | null = null;

  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) userId = session.user.id;

  if (!userId && env.devLogin) {
    const c = (await cookies()).get(DEV_SESSION_COOKIE)?.value;
    if (c) userId = c;
  }
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      status: true,
      staffRole: { select: { role: true } },
      hosterProfile: { select: { userId: true } },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    status: user.status,
    actor: {
      userId: user.id,
      staffRole: user.staffRole?.role ?? null,
      isHoster: !!user.hosterProfile,
    },
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}
