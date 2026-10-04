import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listNotifications } from "@/modules/notifications/service";
import { LocalTime } from "@/components/local-time";
import { markAllReadAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const items = await listNotifications(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {items.some((n) => !n.readAt) && (
          <form action={markAllReadAction}>
            <button className="btn">Mark all read</button>
          </form>
        )}
      </div>
      <ul className="card mt-6 divide-y divide-line p-0 text-sm">
        {items.length === 0 && <li className="p-4 text-muted">Nothing yet.</li>}
        {items.map((n) => (
          <li
            key={n.id}
            className={`flex items-start justify-between gap-4 p-4 ${n.readAt ? "" : "bg-accent/5"}`}
          >
            <div>
              <p className="font-medium">
                {n.href ? (
                  <Link href={n.href} className="hover:text-accent">
                    {n.title}
                  </Link>
                ) : (
                  n.title
                )}
              </p>
              {n.body && <p className="text-muted">{n.body}</p>}
            </div>
            <span className="shrink-0 text-xs text-muted">
              <LocalTime date={n.createdAt} withZone={false} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
