import { StaffRole } from "../enums.js";

/**
 * Central permission and policy checks. Every sensitive action goes through here.
 * Pure functions: callers load the needed facts and pass them in.
 */

export interface Actor {
  readonly userId: string;
  readonly staffRole: StaffRole | null;
  readonly isHoster: boolean;
}

export type Permission =
  | "event.create"
  | "event.manage" // own events: edit, publish, mark paid, remove players, record no-shows, spin
  | "event.intervene" // pause/flag any live event
  | "report.file"
  | "report.review"
  | "warning.issue"
  | "suspension.issue"
  | "ban.permanent"
  | "blacklist.recommend"
  | "blacklist.approve"
  | "hoster.verify"
  | "staff.manage"
  | "content.remove"
  | "dispute.resolve" // staff-level dispute review (hosters resolve their own via event ownership)
  | "appeal.decide"
  | "appeal.final" // final rulings
  | "throwflag.review" // see and work the throw-detection queue
  | "season.manage"; // define leaderboard seasons

const STAFF_RANK: Record<StaffRole, number> = {
  TRIAL_MODERATOR: 1,
  MODERATOR: 2,
  ADMIN: 3,
  FOUNDER: 4,
};

const MIN_RANK: Record<Permission, number | "hoster" | "any"> = {
  "event.create": "hoster",
  "event.manage": "hoster",
  "event.intervene": STAFF_RANK.MODERATOR,
  "report.file": "any",
  "report.review": STAFF_RANK.TRIAL_MODERATOR,
  "warning.issue": STAFF_RANK.TRIAL_MODERATOR,
  "content.remove": STAFF_RANK.TRIAL_MODERATOR,
  "blacklist.recommend": STAFF_RANK.TRIAL_MODERATOR,
  "suspension.issue": STAFF_RANK.MODERATOR,
  "blacklist.approve": STAFF_RANK.MODERATOR,
  "hoster.verify": STAFF_RANK.MODERATOR,
  "ban.permanent": STAFF_RANK.ADMIN,
  "staff.manage": STAFF_RANK.ADMIN,
  "dispute.resolve": STAFF_RANK.TRIAL_MODERATOR,
  "appeal.decide": STAFF_RANK.MODERATOR,
  "appeal.final": STAFF_RANK.ADMIN,
  "throwflag.review": STAFF_RANK.MODERATOR,
  "season.manage": STAFF_RANK.ADMIN,
};

/** Which sanction types each permission level may issue. */
export function canIssueSanction(
  actor: Actor,
  type: "WARNING" | "SUSPENSION" | "PERMANENT_BAN",
): boolean {
  if (type === "WARNING") return hasPermission(actor, "warning.issue");
  if (type === "SUSPENSION") return hasPermission(actor, "suspension.issue");
  return hasPermission(actor, "ban.permanent");
}

export function isStaff(actor: Actor): boolean {
  return actor.staffRole !== null;
}

export function staffRank(role: StaffRole | null): number {
  return role ? STAFF_RANK[role] : 0;
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  const min = MIN_RANK[permission];
  if (min === "any") return true;
  if (min === "hoster") return actor.isHoster || staffRank(actor.staffRole) >= STAFF_RANK.ADMIN;
  return staffRank(actor.staffRole) >= min;
}

/** Hosters can only manage their own events. */
export function canManageEvent(actor: Actor, event: { hosterUserId: string }): boolean {
  return hasPermission(actor, "event.manage") && event.hosterUserId === actor.userId;
}

export interface CaseInvolvement {
  /** Users directly involved in the case (reporter, accused, parties to a dispute). */
  readonly involvedUserIds: readonly string[];
  /** Hoster of the related event, if any. */
  readonly eventHosterUserId?: string | null;
  /** Participants of the related event, if any. */
  readonly eventParticipantUserIds?: readonly string[];
  /** The staff member's declared conflicts of interest. */
  readonly declaredConflictUserIds: readonly string[];
}

export type RecusalReason = "self" | "declared_conflict" | "hosted_event" | "played_in_event";

/** Returns a reason the actor must recuse, or null if they may act. */
export function recusalReason(actor: Actor, c: CaseInvolvement): RecusalReason | null {
  if (c.involvedUserIds.includes(actor.userId)) return "self";
  if (c.declaredConflictUserIds.some((id) => c.involvedUserIds.includes(id)))
    return "declared_conflict";
  if (c.eventHosterUserId && c.eventHosterUserId === actor.userId) return "hosted_event";
  if (c.eventParticipantUserIds?.includes(actor.userId)) return "played_in_event";
  return null;
}

/** Two-person approval: the second approver must be a different, non-recused staff member. */
export function canGiveSecondApproval(
  actor: Actor,
  firstApproverUserId: string,
  c: CaseInvolvement,
): boolean {
  return (
    hasPermission(actor, "blacklist.approve") &&
    actor.userId !== firstApproverUserId &&
    recusalReason(actor, c) === null
  );
}

/** Appeals must be handled by staff not involved in the original decision. */
export function canHandleAppeal(
  actor: Actor,
  originalDecisionStaffIds: readonly string[],
  c: CaseInvolvement,
): boolean {
  return (
    hasPermission(actor, "appeal.decide") &&
    !originalDecisionStaffIds.includes(actor.userId) &&
    recusalReason(actor, c) === null
  );
}

/**
 * Hoster tier is automatic unless staff set it manually.
 * Verified: 5+ completed events with no denied payouts and >=80% confirmations answered paid.
 * Trusted: 25+ completed events, no denied payouts, >=90% paid confirmations, 90+ days hosting.
 */
export function computeHosterTier(input: {
  completedEvents: number;
  confirmedPayouts: number;
  deniedPayouts: number;
  firstEventAt: Date | null;
  now?: Date;
}): "NEW" | "VERIFIED" | "TRUSTED" {
  const now = input.now ?? new Date();
  const asked = input.confirmedPayouts + input.deniedPayouts;
  const paidRate = asked === 0 ? 0 : input.confirmedPayouts / asked;
  const daysHosting = input.firstEventAt
    ? (now.getTime() - input.firstEventAt.getTime()) / 86400_000
    : 0;
  if (
    input.deniedPayouts === 0 &&
    input.completedEvents >= 25 &&
    paidRate >= 0.9 &&
    daysHosting >= 90
  )
    return "TRUSTED";
  if (input.deniedPayouts === 0 && input.completedEvents >= 5 && paidRate >= 0.8) return "VERIFIED";
  return "NEW";
}

/** Verified Player: linked account, 10+ completed events, no sanctions, no active blacklist. */
export function qualifiesVerifiedPlayer(input: {
  linkedAccounts: number;
  eventsPlayed: number;
  sanctions: number;
  activeBlacklist: boolean;
}): boolean {
  return (
    input.linkedAccounts >= 1 &&
    input.eventsPlayed >= 10 &&
    input.sanctions === 0 &&
    !input.activeBlacklist
  );
}
