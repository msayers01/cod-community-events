export function money(cents: number, currency = "USD"): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export const labels: Record<string, string> = {
  SND: "Search & Destroy",
  HARDPOINT: "Hardpoint",
  SWITCHEROO: "Switcheroo",
  STANDARD: "Tournament",
  NA_EAST: "NA East",
  NA_WEST: "NA West",
  EU: "EU",
  OCE: "OCE",
  OTHER: "Other",
  PC: "PC",
  PLAYSTATION: "PlayStation",
  XBOX: "Xbox",
  CROSSPLAY: "Crossplay",
  OPEN: "Open",
  REQUIREMENT_BASED: "Requirements",
  INVITE_ONLY: "Invite only",
  RANDOM: "Fully random",
  SKILL_BALANCED: "Skill-balanced",
  NO_REPEAT_TEAMMATES: "No repeat teammates",
  DRAFT: "Draft",
  CHECK_IN: "Check-in open",
  LIVE: "Live",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
  CANCELLED: "Cancelled",
  WAITLISTED: "Waitlisted",
  CONFIRMED: "Paid",
  CHECKED_IN: "Checked in",
  IN_POOL: "In pool",
  NO_SHOW: "No-show",
  WITHDRAWN: "Withdrawn",
  REMOVED: "Removed",
  NEW: "New Hoster",
  VERIFIED: "Verified Hoster",
  TRUSTED: "Trusted Hoster",
};

export const label = (k: string) => labels[k] ?? k;
