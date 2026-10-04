import { prisma } from "@cod/db";
import { env } from "@/lib/env";
import { devSignInAction } from "./actions";
import { OAuthButtons } from "./oauth-buttons";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const devUsers = env.devLogin
    ? await prisma.user.findMany({
        select: { displayName: true },
        orderBy: { displayName: "asc" },
        take: 50,
      })
    : [];
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        Sign in with the account you already use. No passwords are stored.
      </p>
      <div className="card mt-6 space-y-3">
        <OAuthButtons discord={!!env.discord.id} twitch={!!env.twitch.id} />
        {!env.discord.id && !env.twitch.id && (
          <p className="text-xs text-muted">
            No OAuth providers are configured yet. Set DISCORD_CLIENT_ID / TWITCH_CLIENT_ID in .env.
          </p>
        )}
      </div>
      {env.devLogin && (
        <form action={devSignInAction} className="card mt-6">
          <p className="mb-2 text-xs uppercase tracking-wide text-accent">Development login</p>
          <label className="label" htmlFor="displayName">
            Sign in as seeded user
          </label>
          <select id="displayName" name="displayName" className="input">
            {devUsers.map((u) => (
              <option key={u.displayName}>{u.displayName}</option>
            ))}
          </select>
          {error && <p className="mt-2 text-sm text-warn">Unknown user.</p>}
          <button className="btn btn-primary mt-3">Continue</button>
        </form>
      )}
    </div>
  );
}
