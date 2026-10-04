/**
 * Internal domain events. Written to the outbox in the same transaction as the
 * change that caused them; processed by the worker.
 */
export type DomainEvent =
  | { type: "EventPublished"; eventId: string }
  | { type: "EventCancelled"; eventId: string }
  | { type: "EventCompleted"; eventId: string }
  | { type: "PlayerRegistered"; eventId: string; registrationId: string; userId: string }
  | { type: "PlayerMarkedPaid"; eventId: string; registrationId: string; userId: string }
  | { type: "RegistrationWithdrawn"; eventId: string; registrationId: string; userId: string }
  | { type: "RegistrationRemoved"; eventId: string; registrationId: string; userId: string }
  | { type: "WaitlistPromoted"; eventId: string; registrationId: string; userId: string }
  | { type: "CheckInOpened"; eventId: string }
  | { type: "CheckInClosed"; eventId: string }
  | { type: "PlayerCheckedIn"; eventId: string; registrationId: string; userId: string }
  | { type: "SpinCommitted"; eventId: string; roundId: string; spinId: string }
  | { type: "SpinCompleted"; eventId: string; roundId: string; spinId: string }
  | { type: "WinnersRecorded"; eventId: string }
  | { type: "PayoutConfirmed"; eventId: string; payoutConfirmationId: string; winnerId: string }
  | { type: "PayoutDenied"; eventId: string; payoutConfirmationId: string; winnerId: string }
  | { type: "ReportFiled"; reportId: string; reportedUserId: string }
  | { type: "ReportStatusChanged"; reportId: string; status: string }
  | { type: "SanctionIssued"; sanctionId: string; userId: string }
  | { type: "ResultSubmitted"; matchId: string; submissionId: string; eventId: string }
  | { type: "ResultDisputed"; matchId: string; submissionId: string; eventId: string }
  | { type: "MatchVerified"; matchId: string; submissionId: string; eventId: string }
  | { type: "MatchRejected"; matchId: string; submissionId: string; eventId: string }
  | { type: "TeammateRated"; matchId: string; ratedId: string }
  | { type: "HosterReviewed"; eventId: string; hosterId: string }
  | { type: "BlacklistEntryProposed"; entryId: string; userId: string }
  | { type: "BlacklistEntryActivated"; entryId: string; userId: string }
  | { type: "BlacklistEntryRemoved"; entryId: string; userId: string }
  | { type: "AppealFiled"; appealId: string; appellantId: string }
  | { type: "AppealDecided"; appealId: string; appellantId: string; status: string }
  | { type: "ReputationChanged"; userId: string }
  | { type: "StaffActionLogged"; logId: string }
  | { type: "ScreenshotRead"; submissionId: string; matchId: string; eventId: string }
  | { type: "ThrowFlagRaised"; flagId: string; userId: string }
  | { type: "ThrowFlagReviewed"; flagId: string; status: string }
  | { type: "LeaderboardRefreshRequested"; period: string; periodKey: string };

export type DomainEventType = DomainEvent["type"];

export const DOMAIN_EVENT_TYPES = [
  "EventPublished",
  "EventCancelled",
  "EventCompleted",
  "PlayerRegistered",
  "PlayerMarkedPaid",
  "RegistrationWithdrawn",
  "RegistrationRemoved",
  "WaitlistPromoted",
  "CheckInOpened",
  "CheckInClosed",
  "PlayerCheckedIn",
  "SpinCommitted",
  "SpinCompleted",
  "WinnersRecorded",
  "PayoutConfirmed",
  "PayoutDenied",
  "ReportFiled",
  "ReportStatusChanged",
  "SanctionIssued",
  "ResultSubmitted",
  "ResultDisputed",
  "MatchVerified",
  "MatchRejected",
  "TeammateRated",
  "HosterReviewed",
  "BlacklistEntryProposed",
  "BlacklistEntryActivated",
  "BlacklistEntryRemoved",
  "AppealFiled",
  "AppealDecided",
  "ReputationChanged",
  "StaffActionLogged",
  "ScreenshotRead",
  "ThrowFlagRaised",
  "ThrowFlagReviewed",
  "LeaderboardRefreshRequested",
] as const satisfies readonly DomainEventType[];
