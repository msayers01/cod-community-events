import Link from "next/link";
export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-muted">That page or event doesn&apos;t exist.</p>
      <Link href="/" className="btn mt-6">
        Back to events
      </Link>
    </div>
  );
}
