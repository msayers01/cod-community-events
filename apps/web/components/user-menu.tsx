import Link from "next/link";
import { signOutAction } from "@/app/(site)/sign-in/actions";
import { Avatar } from "./avatar";

export function UserMenu({
  user,
  unread,
  pendingPayouts,
  pendingConfirmations,
}: {
  user: {
    id: string;
    displayName: string;
    avatarUpdatedAt: Date | null;
    isHoster: boolean;
    staff: boolean;
  } | null;
  unread: number;
  pendingPayouts: number;
  pendingConfirmations: number;
}) {
  if (!user) {
    return (
      <Link href="/sign-in" className="btn btn-primary">
        Sign in
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      {pendingPayouts > 0 && (
        <Link href="/payouts" className="tag border-accent text-accent hover:bg-accent/10">
          {pendingPayouts} payout{pendingPayouts === 1 ? "" : "s"} to confirm
        </Link>
      )}
      {pendingConfirmations > 0 && (
        <Link href="/confirmations" className="tag border-warn text-warn hover:bg-warn/10">
          {pendingConfirmations} result{pendingConfirmations === 1 ? "" : "s"} to confirm
        </Link>
      )}
      <Link
        href="/notifications"
        className="relative text-muted hover:text-ink"
        aria-label="Notifications"
      >
        Inbox
        {unread > 0 && (
          <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <Link
        href={`/u/${encodeURIComponent(user.displayName)}`}
        className="flex items-center gap-2 hover:text-accent"
      >
        <Avatar user={user} size={24} />
        {user.displayName}
        {user.staff && <span className="tag ml-2">Staff</span>}
      </Link>
      <Link href="/account" className="text-muted hover:text-ink">
        Account
      </Link>
      <form action={signOutAction}>
        <button className="btn">Sign out</button>
      </form>
    </div>
  );
}
