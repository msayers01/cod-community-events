import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getTemplate, listTemplates } from "@/modules/events/service";
import { deleteTemplateAction } from "@/app/(site)/dashboard/actions";
import { NewEventForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.actor.isHoster) redirect("/dashboard");
  const { template: templateId } = await searchParams;
  const [templates, template] = await Promise.all([
    listTemplates(user.actor),
    templateId ? getTemplate(user.actor, templateId).catch(() => null) : null,
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">New event</h1>
      <p className="mt-1 text-sm text-muted">
        Times are entered in your local timezone and shown to every viewer in theirs.
      </p>

      {templates.length > 0 && (
        <section className="card mt-6 text-sm">
          <h2 className="mb-2 font-semibold">Start from a template</h2>
          <ul className="divide-y divide-line">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span className={t.id === template?.id ? "text-accent" : ""}>{t.name}</span>
                <span className="flex gap-2">
                  <Link href={`/dashboard/events/new?template=${t.id}`} className="btn">
                    Use
                  </Link>
                  <form action={deleteTemplateAction.bind(null, t.id)}>
                    <button className="btn btn-danger">Delete</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NewEventForm key={template?.id ?? "blank"} template={template?.settings ?? null} />
    </div>
  );
}
