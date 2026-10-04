import { notFound, redirect } from "next/navigation";
import { joinCodeSchema } from "@cod/shared";
import { getEventByJoinCode } from "@/modules/events/service";
import { getCurrentUser } from "@/lib/session";
import { register } from "@/modules/registration/service";

/** Short link for Twitch chat: /join/CODE signs the viewer up (after sign-in) and lands on the event. */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const parsed = joinCodeSchema.safeParse((await params).code);
  if (!parsed.success) notFound();
  const event = await getEventByJoinCode(parsed.data);
  if (!event) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=/join/${parsed.data}`);

  try {
    await register(user.id, event.id, "JOIN_LINK");
  } catch {
    // Already registered, event closed, etc. The event page explains the current state.
  }
  redirect(`/events/${event.slug}`);
}
