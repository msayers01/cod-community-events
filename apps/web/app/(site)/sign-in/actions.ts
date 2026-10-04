"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@cod/db";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { DEV_SESSION_COOKIE } from "@/lib/session";

export async function signOutAction() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // no better-auth session; fall through to clear dev cookie
  }
  (await cookies()).delete(DEV_SESSION_COOKIE);
  redirect("/");
}

/** Dev-only: sign in as a seeded user without OAuth. Disabled in production. */
export async function devSignInAction(formData: FormData) {
  if (!env.devLogin) throw new Error("Dev login is disabled");
  const displayName = String(formData.get("displayName") ?? "");
  const user = await prisma.user.findUnique({ where: { displayName }, select: { id: true } });
  if (!user) redirect("/sign-in?error=unknown");
  (await cookies()).set(DEV_SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect("/");
}
