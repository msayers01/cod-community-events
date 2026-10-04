import { EventStatus, RegistrationStatus, RoundStatus, ReportStatus } from "../enums.js";
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
