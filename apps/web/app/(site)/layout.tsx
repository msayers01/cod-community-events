import type { Metadata } from "next";
import Link from "next/link";
import "../globals.css";
import { getCurrentUser } from "@/lib/session";
import { UserMenu } from "@/components/user-menu";
import { unreadCount } from "@/modules/notifications/service";
import { pendingPayoutsFor } from "@/modules/reputation/service";
import { pendingConfirmationsFor } from "@/modules/matches/service";

export const metadata: Metadata = {
  title: { default: "CoD Community Events", template: "%s · CoD Community Events" },
  description: "Community-hosted Call of Duty switcheroos and tournaments, with trust built in.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const [unread, pendingPayouts, pendingConfirmations] = user
    ? await Promise.all([
        unreadCount(user.id),
        pendingPayoutsFor(user.id),
        pendingConfirmationsFor(user.id),
      ])
    : [0, [], []];
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-line">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-semibold tracking-tight">
                <span className="text-accent">●</span> CoD Community Events
              </Link>
              <Link href="/leaderboards" className="text-sm text-muted hover:text-ink">
                Leaderboards
              </Link>
              <Link href="/blacklist" className="text-sm text-muted hover:text-ink">
                Verified reports
              </Link>
              <Link href="/?startingSoon=true" className="text-sm text-muted hover:text-ink">
                Starting soon
              </Link>
              {user?.actor.isHoster && (
                <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
                  Hoster dashboard
                </Link>
              )}
              {user?.actor.staffRole && (
                <Link href="/staff" className="text-sm text-muted hover:text-ink">
                  Staff
                </Link>
              )}
            </div>
            <UserMenu
              user={
                user
                  ? {
                      displayName: user.displayName,
                      isHoster: user.actor.isHoster,
                      staff: !!user.actor.staffRole,
                    }
                  : null
              }
              unread={unread}
              pendingPayouts={pendingPayouts.length}
              pendingConfirmations={pendingConfirmations.length}
            />
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-muted">
          The site never handles money. Hosters collect entries and pay out through their own
          methods.
        </footer>
      </body>
    </html>
  );
}
