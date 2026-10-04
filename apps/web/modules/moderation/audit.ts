import type { Prisma } from "@cod/db";

export interface AuditInput {
  staffUserId: string;
  action: string;
  targetType:
    | "user"
    | "event"
    | "registration"
    | "report"
    | "spin"
    | "match"
    | "blacklist"
    | "appeal"
    | "review";
  targetId: string;
  reason: string;
  metadata?: Prisma.InputJsonValue;
}

/** Append to the staff action log. The table is append-only at the database level. */
export async function logStaffAction(
  tx: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> {
  await tx.staffActionLog.create({ data: input });
}
