import { ZodError } from "zod";
import { InvalidTransitionError } from "@cod/shared";
import { DomainError } from "./errors";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Wrap a server action body so domain errors become form messages instead of crashes. */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (e) {
    if (e instanceof DomainError || e instanceof InvalidTransitionError)
      return { ok: false, error: e.message };
    if (e instanceof ZodError)
      return {
        ok: false,
        error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    if (e instanceof Error && e.message === "UNAUTHENTICATED")
      return { ok: false, error: "Please sign in first" };
    throw e;
  }
}
