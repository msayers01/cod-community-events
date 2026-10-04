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
  | { type: "ReportFiled"; reportId: string; reportedUserId: string }
  | { type: "StaffActionLogged"; logId: string };

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
  "ReportFiled",
  "StaffActionLogged",
] as const satisfies readonly DomainEventType[];
