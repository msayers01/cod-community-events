export function FormMessage({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) return <p className="mt-2 text-sm text-warn">{error}</p>;
  if (ok) return <p className="mt-2 text-sm text-ok">{ok}</p>;
  return null;
}
