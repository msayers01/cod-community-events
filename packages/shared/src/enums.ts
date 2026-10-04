/**
 * Shared string enums. These mirror the Prisma enums in @cod/db one-for-one;
 * the db package has a compile-time check that they stay in sync.
 */
export const GameMode = { SND: "SND", HARDPOINT: "HARDPOINT" } as const;
export type GameMode = (typeof GameMode)[keyof typeof GameMode];

export const EventFormat = { SWITCHEROO: "SWITCHEROO", STANDARD: "STANDARD" } as const;
export type EventFormat = (typeof EventFormat)[keyof typeof EventFormat];

export const EntryType = {
  OPEN: "OPEN",
  REQUIREMENT_BASED: "REQUIREMENT_BASED",
  INVITE_ONLY: "INVITE_ONLY",
} as const;
export type EntryType = (typeof EntryType)[keyof typeof EntryType];

export const Platform = {
  PC: "PC",
  PLAYSTATION: "PLAYSTATION",
  XBOX: "XBOX",
  CROSSPLAY: "CROSSPLAY",
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const Region = {
  NA_EAST: "NA_EAST",
  NA_WEST: "NA_WEST",
  EU: "EU",
  OCE: "OCE",
  OTHER: "OTHER",
} as const;
export type Region = (typeof Region)[keyof typeof Region];

export const EventStatus = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  CHECK_IN: "CHECK_IN",
  LIVE: "LIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  ARCHIVED: "ARCHIVED",
  CANCELLED: "CANCELLED",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const RegistrationStatus = {
  WAITLISTED: "WAITLISTED",
  CONFIRMED: "CONFIRMED",
  CHECKED_IN: "CHECKED_IN",
  IN_POOL: "IN_POOL",
  NO_SHOW: "NO_SHOW",
  WITHDRAWN: "WITHDRAWN",
  REMOVED: "REMOVED",
} as const;
export type RegistrationStatus = (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

export const SignupSource = {
  WEBSITE: "WEBSITE",
  JOIN_LINK: "JOIN_LINK",
  QUICK_ADD: "QUICK_ADD",
} as const;
export type SignupSource = (typeof SignupSource)[keyof typeof SignupSource];

export const RoundStatus = {
  PENDING: "PENDING",
  SPUN: "SPUN",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
} as const;
export type RoundStatus = (typeof RoundStatus)[keyof typeof RoundStatus];

export const AccountStatus = {
  ACTIVE: "ACTIVE",
  WARNED: "WARNED",
  SUSPENDED: "SUSPENDED",
  BANNED: "BANNED",
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const StaffRole = {
  TRIAL_MODERATOR: "TRIAL_MODERATOR",
  MODERATOR: "MODERATOR",
  ADMIN: "ADMIN",
  FOUNDER: "FOUNDER",
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

export const HosterTier = { NEW: "NEW", VERIFIED: "VERIFIED", TRUSTED: "TRUSTED" } as const;
export type HosterTier = (typeof HosterTier)[keyof typeof HosterTier];

export const ReportCategory = {
  NON_PAYMENT: "NON_PAYMENT",
  CHEATING: "CHEATING",
  THROWING: "THROWING",
  REPEATED_NO_SHOWS: "REPEATED_NO_SHOWS",
  HARASSMENT: "HARASSMENT",
  FALSIFIED_RESULTS: "FALSIFIED_RESULTS",
} as const;
export type ReportCategory = (typeof ReportCategory)[keyof typeof ReportCategory];

export const ReportStatus = {
  SUBMITTED: "SUBMITTED",
  GATHERING_EVIDENCE: "GATHERING_EVIDENCE",
  AWAITING_RESPONSE: "AWAITING_RESPONSE",
  UNDER_REVIEW: "UNDER_REVIEW",
  ACTIONED: "ACTIONED",
  DISMISSED: "DISMISSED",
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const PayoutResponse = {
  PAID: "PAID",
  NOT_PAID: "NOT_PAID",
  NO_RESPONSE: "NO_RESPONSE",
} as const;
export type PayoutResponse = (typeof PayoutResponse)[keyof typeof PayoutResponse];

export const MatchStatus = {
  SCHEDULED: "SCHEDULED",
  RESULT_PENDING: "RESULT_PENDING",
  VERIFIED: "VERIFIED",
  DISPUTED: "DISPUTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  REJECTED: "REJECTED",
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

export const SubmissionStatus = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  DISPUTED: "DISPUTED",
  UNCONFIRMED: "UNCONFIRMED",
  UNDER_REVIEW: "UNDER_REVIEW",
  REJECTED: "REJECTED",
} as const;
export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus];

export const ConfirmationResponse = { CONFIRM: "CONFIRM", DISPUTE: "DISPUTE" } as const;
export type ConfirmationResponse = (typeof ConfirmationResponse)[keyof typeof ConfirmationResponse];

export const BadgeKind = {
  FOUNDER: "FOUNDER",
  ADMIN: "ADMIN",
  MODERATOR: "MODERATOR",
  NEW_HOSTER: "NEW_HOSTER",
  VERIFIED_HOSTER: "VERIFIED_HOSTER",
  TRUSTED_HOSTER: "TRUSTED_HOSTER",
  FOUNDING_HOSTER: "FOUNDING_HOSTER",
  VERIFIED_PLAYER: "VERIFIED_PLAYER",
  SUPPORTER: "SUPPORTER",
} as const;
export type BadgeKind = (typeof BadgeKind)[keyof typeof BadgeKind];

export const BlacklistStatus = {
  PROPOSED: "PROPOSED",
  AWAITING_SECOND_APPROVAL: "AWAITING_SECOND_APPROVAL",
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  REMOVED: "REMOVED",
} as const;
export type BlacklistStatus = (typeof BlacklistStatus)[keyof typeof BlacklistStatus];

export const AppealTarget = {
  BLACKLIST_ENTRY: "BLACKLIST_ENTRY",
  SANCTION: "SANCTION",
  DISPUTE_RULING: "DISPUTE_RULING",
} as const;
export type AppealTarget = (typeof AppealTarget)[keyof typeof AppealTarget];

export const AppealStatus = {
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  UPHELD: "UPHELD",
  OVERTURNED: "OVERTURNED",
} as const;
export type AppealStatus = (typeof AppealStatus)[keyof typeof AppealStatus];

export const RandomizationMode = {
  RANDOM: "RANDOM",
  SKILL_BALANCED: "SKILL_BALANCED",
  NO_REPEAT_TEAMMATES: "NO_REPEAT_TEAMMATES",
} as const;
export type RandomizationMode = (typeof RandomizationMode)[keyof typeof RandomizationMode];

export const StatSource = { MANUAL: "MANUAL", OCR: "OCR" } as const;
export type StatSource = (typeof StatSource)[keyof typeof StatSource];

export const ReadingStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;
export type ReadingStatus = (typeof ReadingStatus)[keyof typeof ReadingStatus];

export const ThrowSignal = {
  PERFORMANCE_DROP: "PERFORMANCE_DROP",
  EVENT_LOSS_STREAK: "EVENT_LOSS_STREAK",
  TEAMMATE_LOSS_PATTERN: "TEAMMATE_LOSS_PATTERN",
} as const;
export type ThrowSignal = (typeof ThrowSignal)[keyof typeof ThrowSignal];

export const ThrowFlagStatus = {
  OPEN: "OPEN",
  UNDER_REVIEW: "UNDER_REVIEW",
  DISMISSED: "DISMISSED",
  ESCALATED: "ESCALATED",
} as const;
export type ThrowFlagStatus = (typeof ThrowFlagStatus)[keyof typeof ThrowFlagStatus];

export const LeaderboardPeriod = {
  MONTH: "MONTH",
  SEASON: "SEASON",
  ALL_TIME: "ALL_TIME",
} as const;
export type LeaderboardPeriod = (typeof LeaderboardPeriod)[keyof typeof LeaderboardPeriod];
