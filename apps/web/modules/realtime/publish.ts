import { prisma } from "@cod/db";
import { createPublisher, rooms, type EventUpdated, type Publisher } from "@cod/realtime";
import { overlayState } from "@/modules/wheel/overlay-state";

declare global {
  var __codPublisher: Publisher | undefined;
}

function publisher(): Publisher {
  globalThis.__codPublisher ??= createPublisher();
  return globalThis.__codPublisher;
}

/**
 * Push the current state of an event to everyone watching it. Call this AFTER
 * the transaction that changed the event has committed; it reads fresh state
 * and is best-effort (the database remains the source of truth).
 */
export async function publishEventUpdate(
  eventId: string,
  reason: EventUpdated["reason"],
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      status: true,
      overlayKey: true,
      registrations: { select: { status: true } },
    },
  });
  if (!event) return;

  const count = (...statuses: string[]) =>
    event.registrations.filter((r) => statuses.includes(r.status)).length;
  const update: EventUpdated = {
    eventId,
    status: event.status,
    confirmedCount: count("CONFIRMED", "CHECKED_IN", "IN_POOL"),
    waitlistCount: count("WAITLISTED"),
    checkedInCount: count("CHECKED_IN", "IN_POOL"),
    reason,
  };
  const pub = publisher();
  await pub.publish({ room: rooms.event(eventId), event: "event.updated", data: update });

  // The overlay cares about pool membership, status and spins.
  if (reason !== "registration" || ["CHECK_IN", "LIVE"].includes(event.status)) {
    const state = await overlayState(event.overlayKey);
    if (state)
      await pub.publish({
        room: rooms.overlay(event.overlayKey),
        event: "overlay.state",
        data: state,
      });
  }
}
