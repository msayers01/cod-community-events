import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@cod/shared";
import { getCurrentUser } from "@/lib/session";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isStaff(user.actor)) redirect("/");
  return (
    <div>
      <nav className="mb-6 flex items-center gap-4 border-b border-line pb-3 text-sm">
        <span className="font-semibold">Staff</span>
        <Link href="/staff" className="text-muted hover:text-ink">
          Report queue
        </Link>
        <Link href="/staff/log" className="text-muted hover:text-ink">
          Action log
        </Link>
        <span className="ml-auto tag">{user.actor.staffRole?.replace("_", " ").toLowerCase()}</span>
      </nav>
      {children}
    </div>
  );
}
