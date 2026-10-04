import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { NewEventForm } from "./form";

export default async function NewEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.actor.isHoster) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">New event</h1>
      <p className="mt-1 text-sm text-muted">
        Times are entered in your local timezone and shown to every viewer in theirs.
      </p>
      <NewEventForm />
    </div>
  );
}
