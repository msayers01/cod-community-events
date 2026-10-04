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
  | "content.remove";

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
    hasPermission(actor, "report.review") &&
    !originalDecisionStaffIds.includes(actor.userId) &&
    recusalReason(actor, c) === null
  );
}
