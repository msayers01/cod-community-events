// Container health probe. web and realtime answer over HTTP; the worker and bot have no
// port, so for them "the process is alive" (which this probe running proves) is the check.
const service = process.env.SERVICE ?? "web";
const target = {
  web: `http://127.0.0.1:${process.env.PORT ?? 3000}/api/health`,
  realtime: `http://127.0.0.1:${process.env.REALTIME_PORT ?? process.env.PORT ?? 3001}/healthz`,
}[service];
if (!target) process.exit(0);
try {
  const res = await fetch(target, { signal: AbortSignal.timeout(4000) });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
