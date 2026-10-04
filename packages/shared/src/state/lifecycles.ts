import {
  AppealStatus,
  BlacklistStatus,
  EventStatus,
  MatchStatus,
  RegistrationStatus,
  ReportStatus,
  RoundStatus,
  SubmissionStatus,
  ThrowFlagStatus,
} from "../enums.js";
import { createMachine } from "./machine.js";

export const eventMachine = createMachine<EventStatus>("Event", {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["CHECK_IN", "CANCELLED"],
  CHECK_IN: ["LIVE", "CANCELLED"],
  LIVE: ["COMPLETED", "PAUSED"],
  PAUSED: ["LIVE", "CANCELLED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
  CANCELLED: [],
});

export const registrationMachine = createMachine<RegistrationStatus>("Registration", {
  WAITLISTED: ["CONFIRMED", "REMOVED", "WITHDRAWN"],
  CONFIRMED: ["CHECKED_IN", "NO_SHOW", "REMOVED", "WITHDRAWN"],
  CHECKED_IN: ["IN_POOL", "REMOVED", "WITHDRAWN"],
  IN_POOL: [],
  NO_SHOW: [],
  WITHDRAWN: [],
  REMOVED: [],
});

export const roundMachine = createMachine<RoundStatus>("Round", {
  PENDING: ["SPUN"],
  SPUN: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETE"],
  COMPLETE: [],
});

export const reportMachine = createMachine<ReportStatus>("Report", {
  SUBMITTED: ["GATHERING_EVIDENCE", "DISMISSED"],
  GATHERING_EVIDENCE: ["AWAITING_RESPONSE", "UNDER_REVIEW", "DISMISSED"],
  AWAITING_RESPONSE: ["UNDER_REVIEW", "DISMISSED"],
  UNDER_REVIEW: ["ACTIONED", "DISMISSED"],
  ACTIONED: [],
  DISMISSED: [],
});

/** Registration statuses that occupy a confirmed (paid) spot. */
export const OCCUPYING_STATUSES: readonly RegistrationStatus[] = [
  RegistrationStatus.CONFIRMED,
  RegistrationStatus.CHECKED_IN,
  RegistrationStatus.IN_POOL,
];

export const submissionMachine = createMachine<SubmissionStatus>("ResultSubmission", {
  PENDING: ["VERIFIED", "DISPUTED", "UNCONFIRMED"],
  DISPUTED: ["UNDER_REVIEW"],
  UNCONFIRMED: ["UNDER_REVIEW", "VERIFIED"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED"],
  VERIFIED: [],
  REJECTED: [],
});

export const matchMachine = createMachine<MatchStatus>("Match", {
  SCHEDULED: ["RESULT_PENDING"],
  RESULT_PENDING: ["VERIFIED", "DISPUTED", "UNDER_REVIEW"],
  DISPUTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["VERIFIED", "REJECTED"],
  REJECTED: ["RESULT_PENDING"],
  VERIFIED: [],
});

export const blacklistMachine = createMachine<BlacklistStatus>("BlacklistEntry", {
  PROPOSED: ["AWAITING_SECOND_APPROVAL", "REMOVED"],
  AWAITING_SECOND_APPROVAL: ["ACTIVE", "REMOVED"],
  ACTIVE: ["EXPIRED", "REMOVED"],
  EXPIRED: [],
  REMOVED: [],
});

export const appealMachine = createMachine<AppealStatus>("Appeal", {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["UPHELD", "OVERTURNED"],
  UPHELD: [],
  OVERTURNED: [],
});

/**
 * Throw flags are a review queue, not a verdict. Escalating files a report that
 * goes through the normal report lifecycle; a flag never sanctions anyone.
 */
export const throwFlagMachine = createMachine<ThrowFlagStatus>("ThrowFlag", {
  OPEN: ["UNDER_REVIEW", "DISMISSED"],
  UNDER_REVIEW: ["DISMISSED", "ESCALATED"],
  DISMISSED: [],
  ESCALATED: [],
});
