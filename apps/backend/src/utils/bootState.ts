/**
 * Readiness for the Railway healthcheck (`healthcheckPath: /health`).
 *
 * The process starts listening before migrations, index assertions and the job
 * scheduler have run, so /health must report 503 until they finish — otherwise
 * a restart or a replica scale-up serves live traffic against a half-migrated
 * database behind a green healthcheck.
 *
 * Defaults to `ready` so anything that builds the app without the production
 * boot sequence (tests, scripts/e2e-server.ts) keeps working unchanged; only
 * src/index.ts declares a boot in progress.
 */
export type BootPhase = 'starting' | 'ready' | 'failed'

let phase: BootPhase = 'ready'
let reason: string | null = null

export function markBootStarting(): void {
  phase = 'starting'
  reason = null
}

export function markBootReady(): void {
  phase = 'ready'
  reason = null
}

export function markBootFailed(failureReason: string): void {
  phase = 'failed'
  reason = failureReason
}

export function bootState(): { phase: BootPhase; reason: string | null } {
  return { phase, reason }
}

export function isBootReady(): boolean {
  return phase === 'ready'
}

/** Test-only reset; modules are shared across cases in a Vitest file. */
export function resetBootStateForTests(): void {
  phase = 'ready'
  reason = null
}
