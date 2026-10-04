import Link from "next/link";
import { signOutAction } from "@/app/(site)/sign-in/actions";

export function UserMenu({
  user,
}: {
  user: { displayName: string; isHoster: boolean; staff: boolean } | null;
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
      <Link href={`/u/${encodeURIComponent(user.displayName)}`} className="hover:text-accent">
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
