/** Rate limiters run in every environment except Vitest (see createApp). */
export function skipRateLimitInTests(): boolean {
  return process.env.VITEST === 'true'
}
