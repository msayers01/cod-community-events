"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">
        The error has been recorded. Try again, or head back to the events list.
      </p>
      <button className="btn mt-6" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
