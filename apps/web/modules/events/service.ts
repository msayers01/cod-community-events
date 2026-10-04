import { prisma, emit, type Prisma } from "@cod/db";
import {
  canManageEvent,
  createEventSchema,
  eventTemplateSettingsSchema,
  eventMachine,
  hasPermission,
  type Actor,
  type CreateEventInput,
  type EventFilter,
  type EventStatus,
} from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { publishEventUpdate } from "@/modules/realtime/publish";
import { newJoinCode, newOverlayKey, slugify } from "@/lib/ids";
import { logStaffAction } from "@/modules/moderation/audit";

const PUBLIC_STATUSES: EventStatus[] = ["OPEN", "CHECK_IN", "LIVE", "PAUSED", "COMPLETED"];

export async function registerAsHoster(
  actor: Actor,
  input: { twitterHandle?: string; discordInvite?: string },
) {
  return prisma.hosterProfile.upsert({
    where: { userId: actor.userId },
    update: {},
    create: {
      userId: actor.userId,
      twitterHandle: input.twitterHandle?.replace(/^@/, ""),
      discordInvite: input.discordInvite,
    },
  });
}

export async function createEvent(actor: Actor, raw: unknown) {
  if (!hasPermission(actor, "event.create")) throw new ForbiddenError("Register as a hoster first");
  const input: CreateEventInput = createEventSchema.parse(raw);
  const { rules, payoutSplit, entryRequirements, ...rest } = input;
  return prisma.event.create({
    data: {
      ...rest,
      rules: rules as Prisma.InputJsonValue,
      payoutSplit: payoutSplit as Prisma.InputJsonValue,
      entryRequirements:
        entryRequirements === null ? undefined : (entryRequirements as Prisma.InputJsonValue),
      hosterId: actor.userId,
      slug: slugify(input.title),
      joinCode: newJoinCode(),
      overlayKey: newOverlayKey(),
    },
  });
}

async function loadOwnedEvent(actor: Actor, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError("Event");
  if (!canManageEvent(actor, { hosterUserId: event.hosterId })) throw new ForbiddenError();
  return event;
}

export async function publishEvent(actor: Actor, eventId: string) {
  const event = await loadOwnedEvent(actor, eventId);
  eventMachine.assertTransition(event.status, "OPEN");
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: { status: "OPEN", publishedAt: new Date() },
    });
    await emit(tx, { type: "EventPublished", eventId });
    return updated;
  });
  await publishEventUpdate(eventId, "status");
  return result;
}

export async function openCheckIn(actor: Actor, eventId: string) {
  const event = await loadOwnedEvent(actor, eventId);
  eventMachine.assertTransition(event.status, "CHECK_IN");
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id: eventId }, data: { status: "CHECK_IN" } });
    await emit(tx, { type: "CheckInOpened", eventId });
    return updated;
  });
  await publishEventUpdate(eventId, "status");
  return result;
}

/**
 * Hoster starts the event: closes check-in, marks remaining paid players as no-shows,
 * moves checked-in players into the spin pool.
 */
export async function startEvent(actor: Actor, eventId: string) {
  const event = await loadOwnedEvent(actor, eventId);
  eventMachine.assertTransition(event.status, "LIVE");
  const result = await prisma.$transaction(async (tx) => {
    await tx.registration.updateMany({
      where: { eventId, status: "CONFIRMED" },
      data: { status: "NO_SHOW" },
    });
    await tx.registration.updateMany({
      where: { eventId, status: "CHECKED_IN" },
      data: { status: "IN_POOL" },
    });
    const updated = await tx.event.update({ where: { id: eventId }, data: { status: "LIVE" } });
    await emit(tx, { type: "CheckInClosed", eventId });
    return updated;
  });
  await publishEventUpdate(eventId, "status");
  return result;
}

export async function completeEvent(actor: Actor, eventId: string) {
  const event = await loadOwnedEvent(actor, eventId);
  eventMachine.assertTransition(event.status, "COMPLETED");
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await emit(tx, { type: "EventCompleted", eventId });
    return updated;
  });
  await publishEventUpdate(eventId, "status");
  return result;
}

export async function cancelEvent(actor: Actor, eventId: string, reason: string) {
  const event = await loadOwnedEvent(actor, eventId);
  eventMachine.assertTransition(event.status, "CANCELLED");
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    await emit(tx, { type: "EventCancelled", eventId });
    return updated;
  });
  await publishEventUpdate(eventId, "status");
  return result;
}

/** Staff intervention: pause a live event. */
export async function pauseEvent(actor: Actor, eventId: string, reason: string) {
  if (!hasPermission(actor, "event.intervene")) throw new ForbiddenError();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError("Event");
  if (event.hosterId === actor.userId)
    throw new ForbiddenError("You must recuse from your own event");
  eventMachine.assertTransition(event.status, "PAUSED");
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id: eventId }, data: { status: "PAUSED" } });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "event.paused",
      targetType: "event",
      targetId: eventId,
      reason,
    });
    return updated;
  });
  await publishEventUpdate(eventId, "status");
  return result;
}

export async function regenerateOverlayKey(actor: Actor, eventId: string) {
  await loadOwnedEvent(actor, eventId);
  return prisma.event.update({ where: { id: eventId }, data: { overlayKey: newOverlayKey() } });
}

export async function listPublicEvents(filter: EventFilter) {
  const now = new Date();
  const where: Prisma.EventWhereInput = {
    status: { in: PUBLIC_STATUSES },
    ...(filter.mode && { mode: filter.mode }),
    ...(filter.format && { format: filter.format }),
    ...(filter.region && { region: filter.region }),
    ...(filter.platform && { platform: filter.platform }),
    ...(filter.startingSoon && {
      startsAt: { gte: now, lte: new Date(now.getTime() + 6 * 3600_000) },
    }),
  };
  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: filter.limit + 1,
    ...(filter.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    include: {
      hoster: { include: { user: { select: { displayName: true } } } },
      _count: {
        select: {
          registrations: { where: { status: { in: ["CONFIRMED", "CHECKED_IN", "IN_POOL"] } } },
        },
      },
    },
  });
  const hasMore = events.length > filter.limit;
  const page = hasMore ? events.slice(0, filter.limit) : events;
  const withSpots = page.map((e) => ({
    ...e,
    confirmedCount: e._count.registrations,
    spotsLeft: e.playerCap - e._count.registrations,
  }));
  return {
    events: filter.hasSpots ? withSpots.filter((e) => e.spotsLeft > 0) : withSpots,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function getEventBySlug(slug: string) {
  const event = await prisma.event.findUnique({
    where: { slug },
    include: {
      hoster: { include: { user: { select: { id: true, displayName: true, streamUrl: true } } } },
      registrations: {
        where: { status: { notIn: ["WITHDRAWN", "REMOVED"] } },
        orderBy: [{ status: "asc" }, { waitlistPosition: "asc" }, { createdAt: "asc" }],
        include: { player: { select: { id: true, displayName: true, streamUrl: true } } },
      },
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: {
          spin: true,
          teams: {
            orderBy: { label: "asc" },
            include: {
              members: { include: { user: { select: { id: true, displayName: true } } } },
            },
          },
        },
      },
    },
  });
  if (!event) return null;
  // Never expose an unrevealed secret.
  const rounds = event.rounds.map((r) => ({
    ...r,
    spin: r.spin ? { ...r.spin, secret: undefined } : null,
  }));
  return { ...event, rounds };
}

export async function getEventByJoinCode(code: string) {
  return prisma.event.findUnique({
    where: { joinCode: code.toUpperCase() },
    select: { id: true, slug: true, status: true },
  });
}

export async function listHosterEvents(actor: Actor) {
  return prisma.event.findMany({
    where: { hosterId: actor.userId },
    orderBy: { startsAt: "desc" },
    include: {
      _count: {
        select: {
          registrations: { where: { status: { in: ["CONFIRMED", "CHECKED_IN", "IN_POOL"] } } },
        },
      },
    },
  });
}

export function assertEventExists<T>(e: T | null): T {
  if (!e) throw new NotFoundError("Event");
  return e;
}

export { DomainError };

// ───────────── Templates ─────────────

export async function saveTemplateFromEvent(actor: Actor, eventId: string, name: string) {
  const event = await loadOwnedEvent(actor, eventId);
  const settings = eventTemplateSettingsSchema.parse({
    mode: event.mode,
    format: event.format,
    teamSize: event.teamSize,
    roundCount: event.roundCount,
    playerCap: event.playerCap,
    entryFeeCents: event.entryFeeCents,
    currency: event.currency,
    payoutSplit: event.payoutSplit,
    region: event.region,
    platform: event.platform,
    rules: event.rules,
    entryType: event.entryType,
    entryRequirements: event.entryRequirements,
    randomization: event.randomization,
    description: event.description,
  });
  return prisma.eventTemplate.upsert({
    where: { hosterId_name: { hosterId: actor.userId, name } },
    update: { settings: settings as Prisma.InputJsonValue },
    create: { hosterId: actor.userId, name, settings: settings as Prisma.InputJsonValue },
  });
}

export async function listTemplates(actor: Actor) {
  return prisma.eventTemplate.findMany({
    where: { hosterId: actor.userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTemplate(actor: Actor, templateId: string) {
  const t = await prisma.eventTemplate.findUnique({ where: { id: templateId } });
  if (!t || t.hosterId !== actor.userId) throw new NotFoundError("Template");
  return { ...t, settings: eventTemplateSettingsSchema.parse(t.settings) };
}

export async function deleteTemplate(actor: Actor, templateId: string) {
  await getTemplate(actor, templateId);
  await prisma.eventTemplate.delete({ where: { id: templateId } });
}
