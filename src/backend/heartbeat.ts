// American Rider's paid Render service runs its own authorized scheduled
// sweeps every 60 seconds. Phone-driven wake-ups are intentionally disabled.
//
// Prior implementations called GET /scheduled/sweep without SCHEDULER_TOKEN.
// The server correctly denied those calls with 401, so the app produced
// needless requests without contributing to monitoring or safety.
//
// This backwards-compatible export remains a no-op for older imports only.
export function pingSweep(): void { /* server runs its own sweeps */ }
export function startHeartbeat(): () => void {
  return () => {};
}
