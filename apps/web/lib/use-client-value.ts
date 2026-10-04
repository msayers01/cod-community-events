"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Returns `serverValue` during SSR and hydration, then `compute()` on the client.
 * Hydration-safe way to show browser-only values (local time, timezone offset).
 */
export function useClientValue<T>(compute: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribe, compute, () => serverValue);
}
