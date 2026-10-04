import { redirect } from "next/navigation";
import { prisma } from "@cod/db";
import { getCurrentUser } from "@/lib/session";
import Link from "next/link";
import { ProfileForm } from "./form";
import { AvatarUploader } from "./avatar-uploader";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/sign-in");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: current.id },
    select: {
      id: true,
      displayName: true,
      avatarUpdatedAt: true,
      activisionId: true,
      streamUrl: true,
      bio: true,
      accounts: { select: { providerId: true, handle: true } },
    },
  });
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Your account</h1>
      <p className="mt-1 text-sm text-muted">
        Your Activision ID is shown to hosters and teammates. We never pull data from Activision;
        it&apos;s display only.
      </p>
      <p className="mt-2 text-sm">
        <Link href="/account/reports" className="text-accent">
          Reports involving you
        </Link>{" "}
        ·{" "}
        <Link href="/payouts" className="text-accent">
          Payout confirmations
        </Link>
      </p>
      <AvatarUploader user={user} />
      <ProfileForm initial={user} />
      <section className="card mt-6 text-sm">
        <h2 className="mb-2 font-semibold">Linked accounts</h2>
        {user.accounts.length === 0 ? (
          <p className="text-muted">None linked. Sign in with Discord or Twitch to link them.</p>
        ) : (
          <ul>
            {user.accounts.map((a) => (
              <li key={a.providerId}>
                {a.providerId}
                {a.handle ? ` · ${a.handle}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
